function createPlaidSyncService({
  plaidClient,
  supabaseRequest,
  decryptAccessToken,
  reportItemHealth,
}) {
  function normalizeMerchantName(transaction) {
    return String(
      transaction.merchant_name ||
        transaction.name ||
        transaction.counterparties?.[0]?.name ||
        '',
    )
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function serializeSyncError(error) {
    const plaidError = error.response?.data;

    if (plaidError && typeof plaidError === 'object') {
      return {
        message: plaidError.error_message || error.message || 'Plaid sync failed',
        code: plaidError.error_code || null,
        request_id: plaidError.request_id || null,
        requires_relink: plaidError.error_code === 'ITEM_LOGIN_REQUIRED',
      };
    }

    return {
      message: error.message || 'Plaid sync failed',
      code: null,
      request_id: null,
      requires_relink: false,
    };
  }

  async function fetchPlaidItemsForUser(userId) {
    const params = new URLSearchParams({
      select: 'id,user_id,plaid_item_id,access_token_encrypted,institution_name,last_cursor,created_at',
      user_id: `eq.${userId}`,
      order: 'created_at.desc',
    });

    return supabaseRequest(`/rest/v1/plaid_items?${params.toString()}`, {
      method: 'GET',
    });
  }

  async function upsertAccountsForItem({ userId, plaidItem }) {
    const accessToken = decryptAccessToken(plaidItem.access_token_encrypted);
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accountPayload = accountsResponse.data.accounts.map((account) => ({
      user_id: userId,
      plaid_item_id: plaidItem.id,
      plaid_account_id: account.account_id,
      account_name: account.name,
      account_type: [account.type, account.subtype].filter(Boolean).join(':') || account.type || 'other',
    }));

    if (accountPayload.length > 0) {
      await supabaseRequest('/rest/v1/accounts?on_conflict=plaid_account_id', {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(accountPayload),
      });
    }

    const accountParams = new URLSearchParams({
      select: 'id,plaid_account_id,account_name,account_type,plaid_item_id',
      user_id: `eq.${userId}`,
      plaid_item_id: `eq.${plaidItem.id}`,
    });

    const localAccounts = await supabaseRequest(`/rest/v1/accounts?${accountParams.toString()}`, {
      method: 'GET',
    });

    const accountMap = new Map(
      localAccounts.map((account) => [account.plaid_account_id, account]),
    );

    return {
      plaidAccounts: accountsResponse.data.accounts,
      localAccounts,
      accountMap,
    };
  }

  async function upsertTransactions({ userId, plaidItem, transactions, accountMap }) {
    const payload = transactions
      .map((transaction) => {
        const localAccount = accountMap.get(transaction.account_id);

        if (!localAccount) {
          return null;
        }

        return {
          user_id: userId,
          account_id: localAccount.id,
          plaid_transaction_id: transaction.transaction_id,
          institution_name: plaidItem.institution_name,
          transaction_name: transaction.name || null,
          merchant_name:
            transaction.merchant_name ||
            transaction.name ||
            transaction.counterparties?.[0]?.name ||
            null,
          normalized_merchant_name: normalizeMerchantName(transaction) || null,
          plaid_category_primary: transaction.personal_finance_category?.primary || null,
          plaid_category_detailed: transaction.personal_finance_category?.detailed || null,
          location_city: transaction.location?.city || null,
          location_region: transaction.location?.region || null,
          date: transaction.date,
          amount: Number(transaction.amount || 0),
        };
      })
      .filter(Boolean);

    if (payload.length === 0) {
      return 0;
    }

    await supabaseRequest('/rest/v1/transactions?on_conflict=plaid_transaction_id', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    });

    return payload.length;
  }

  async function refreshRecentTransactionMetadata({ userId, plaidItem, accountMap }) {
    const accessToken = decryptAccessToken(plaidItem.access_token_encrypted);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 120);

    const formatDate = (value) => value.toISOString().split('T')[0];

    let offset = 0;
    let totalTransactions = 0;

    do {
      const response = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
        options: {
          count: 100,
          offset,
        },
      });

      const data = response.data;
      totalTransactions = Number(data.total_transactions || 0);

      await upsertTransactions({
        userId,
        plaidItem,
        transactions: data.transactions || [],
        accountMap,
      });

      offset += (data.transactions || []).length;
    } while (offset < totalTransactions);
  }

  async function deleteRemovedTransactions({ userId, removedTransactionIds }) {
    for (const transactionId of removedTransactionIds) {
      const params = new URLSearchParams({
        user_id: `eq.${userId}`,
        plaid_transaction_id: `eq.${transactionId}`,
      });

      await supabaseRequest(`/rest/v1/transactions?${params.toString()}`, {
        method: 'DELETE',
      });
    }
  }

  async function updateCursor(plaidItemId, nextCursor) {
    const params = new URLSearchParams({
      id: `eq.${plaidItemId}`,
    });

    await supabaseRequest(`/rest/v1/plaid_items?${params.toString()}`, {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        last_cursor: nextCursor,
      }),
    });
  }

  async function syncPlaidItem({ userId, plaidItem }) {
    try {
      const { localAccounts, accountMap } = await upsertAccountsForItem({
        userId,
        plaidItem,
      });

      const accessToken = decryptAccessToken(plaidItem.access_token_encrypted);
      let cursor = plaidItem.last_cursor || undefined;
      let nextCursor = cursor || null;
      let hasMore = true;
      let addedCount = 0;
      let modifiedCount = 0;
      const removedIds = [];

      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor,
          count: 100,
        });

        const data = response.data;
        addedCount += await upsertTransactions({
          userId,
          plaidItem,
          transactions: data.added || [],
          accountMap,
        });
        modifiedCount += await upsertTransactions({
          userId,
          plaidItem,
          transactions: data.modified || [],
          accountMap,
        });

        removedIds.push(...(data.removed || []).map((entry) => entry.transaction_id));
        nextCursor = data.next_cursor;
        cursor = data.next_cursor;
        hasMore = Boolean(data.has_more);
      }

      if (removedIds.length > 0) {
        await deleteRemovedTransactions({
          userId,
          removedTransactionIds: removedIds,
        });
      }

      // Backfill richer metadata like location.city for existing transactions that may
      // have been stored before these fields were added or omitted from sync payloads.
      await refreshRecentTransactionMetadata({
        userId,
        plaidItem,
        accountMap,
      });

      await updateCursor(plaidItem.id, nextCursor);

      // This service is intentionally reusable so webhook handlers can call it later
      // when Plaid notifies the app about fresh transaction updates.
      reportItemHealth(plaidItem.plaid_item_id, {
        status: 'healthy',
        message: null,
        updated_at: new Date().toISOString(),
      });

      return {
        plaid_item_id: plaidItem.plaid_item_id,
        institution_name: plaidItem.institution_name,
        accounts_synced: localAccounts.length,
        transactions_added: addedCount,
        transactions_modified: modifiedCount,
        transactions_removed: removedIds.length,
        next_cursor: nextCursor,
        status: 'healthy',
      };
    } catch (error) {
      const details = serializeSyncError(error);

      reportItemHealth(plaidItem.plaid_item_id, {
        status: details.requires_relink ? 'repair_required' : 'sync_error',
        message: details.message,
        code: details.code,
        request_id: details.request_id,
        updated_at: new Date().toISOString(),
      });

      throw Object.assign(new Error(details.message), {
        syncDetails: details,
      });
    }
  }

  async function syncAllUserItems(userId) {
    const items = await fetchPlaidItemsForUser(userId);

    if (!items.length) {
      return {
        synced_items: [],
        failed_items: [],
        total_items: 0,
      };
    }

    const syncedItems = [];
    const failedItems = [];

    for (const plaidItem of items) {
      try {
        const result = await syncPlaidItem({
          userId,
          plaidItem,
        });
        syncedItems.push(result);
      } catch (error) {
        failedItems.push({
          plaid_item_id: plaidItem.plaid_item_id,
          institution_name: plaidItem.institution_name,
          ...(error.syncDetails || { message: error.message }),
        });
      }
    }

    return {
      synced_items: syncedItems,
      failed_items: failedItems,
      total_items: items.length,
    };
  }

  return {
    fetchPlaidItemsForUser,
    syncPlaidItem,
    syncAllUserItems,
    upsertAccountsForItem,
    refreshRecentTransactionMetadata,
  };
}

module.exports = {
  createPlaidSyncService,
};
