import { useEffect, useState } from 'react';
import { useSocket } from './useSocket';

interface RankInfo {
  rank: number;
  username: string;
  balance: number;
  wins: number;
  losses: number;
}

export function useMyRank(userId: string | undefined) {
  const socket = useSocket();
  const [rankInfo, setRankInfo] = useState<RankInfo | null>(null);

  useEffect(() => {
    if (!userId) return;

    const request = () => socket.emit('get_my_rank', { userId });

    socket.on('my_rank', (data: RankInfo | null) => setRankInfo(data));

    if (socket.connected) {
      request();
    } else {
      socket.once('connect', request);
    }

    return () => {
      socket.off('my_rank');
      socket.off('connect', request);
    };
  }, [socket, userId]);

  return rankInfo;
}
