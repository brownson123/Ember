import { useEffect } from 'react';
import { bridgefyManager } from '../lib/bridgefyManager';
import { supabase } from '../lib/supabase';

export default function MeshProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let active = true;

    const initForCurrentUser = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      const meshIdentity = user?.email ?? user?.id;
      if (active && meshIdentity) {
        await bridgefyManager.init(meshIdentity);
      }
    };

    void initForCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const meshIdentity = session?.user?.email ?? session?.user?.id;
      if (meshIdentity) {
        void bridgefyManager.init(meshIdentity);
      } else {
        void bridgefyManager.stop();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return <>{children}</>;
}