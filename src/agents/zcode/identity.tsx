import {createContext,useContext,type ReactNode} from 'react';
import type {AgentProfile} from '../../../shared/contracts';
import {AgentAvatar} from '../AgentIdentity';
const identities=createContext<AgentProfile[]>([]);
export function WorkflowIdentityProvider({agents,children}:{agents:AgentProfile[];children:ReactNode}){return <identities.Provider value={agents}>{children}</identities.Provider>;}
export function WorkflowIdentity({index,name,className}:{index?:number;name:string;className?:string}){const agents=useContext(identities),agent=(index===undefined?undefined:agents[index])??agents.find(a=>a.name===name)??{id:name,name};return <span className={`zc-person ${className??''}`}><AgentAvatar agent={agent} size={20}/></span>;}
