import { useEffect, useState } from 'react';
import type { UsageStore } from '../../settings/schema';
import { getUsageStore, watchUsage } from '../../settings/usage';

/** 토큰 사용량 기록(local)을 읽고 변경을 구독한다. 첫 로드 전엔 null. 옵션·팝업이 함께 쓴다. */
export function useUsage(): UsageStore | null {
  const [store, setStore] = useState<UsageStore | null>(null);
  useEffect(() => {
    let alive = true;
    getUsageStore().then((s) => alive && setStore(s));
    const off = watchUsage((s) => alive && setStore(s));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return store;
}
