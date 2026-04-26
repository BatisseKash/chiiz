import { PlaidConnectionCard } from '../components/PlaidConnectionCard';
import type { LinkedPlaidItem } from '../types';

type SettingsViewProps = {
  accountCount: number | null;
  linkedItems: LinkedPlaidItem[];
  plaidLoading: boolean;
  onConnectPlaid: () => void;
};

export function SettingsView({
  accountCount,
  linkedItems,
  plaidLoading,
  onConnectPlaid,
}: SettingsViewProps) {
  return (
    <PlaidConnectionCard
      accountCount={accountCount}
      linkedItems={linkedItems}
      loading={plaidLoading}
      onConnect={onConnectPlaid}
    />
  );
}
