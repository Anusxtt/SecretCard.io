import { Wallet } from 'lucide-react';
import { AuthUser } from '../hooks/useAuth';

interface Props {
  user: AuthUser;
}

export function WalletDisplay({ user }: Props) {
  return (
    <div style={styles.wallet}>
      <span style={{ color: '#aaa', fontSize: 12 }}>กระเป๋า</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Wallet size={16} color="#ffd700" />
        <span style={{ color: '#ffd700', fontWeight: 'bold', fontSize: 18 }}>
          {user.balance.toLocaleString()} บาท
        </span>
      </div>
      {user.isGuest && <span style={{ color: '#888', fontSize: 11 }}>(Guest)</span>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wallet: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
};
