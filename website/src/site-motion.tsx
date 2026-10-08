import {createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction} from 'react';

type SiteMotion = {paused: boolean; setPaused: Dispatch<SetStateAction<boolean>>};
const Context = createContext<SiteMotion | null>(null);

/** One visitor-controlled pause owns both parts of the opening illustration. */
export function SiteMotionProvider({children}: {children: ReactNode}) {
 const [paused, setPaused] = useState(false);
 return <Context.Provider value={{paused, setPaused}}>{children}</Context.Provider>;
}

export function useSiteMotion() {
 const motion = useContext(Context);
 if (!motion) throw new Error('Site motion requires its provider.');
 return motion;
}
