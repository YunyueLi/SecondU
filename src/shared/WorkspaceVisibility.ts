import {createContext,useContext} from 'react';

/** Kept-alive workspaces retain drafts while their dialogs follow page visibility. */
export const WorkspaceVisibility=createContext(true);
export const useWorkspaceVisible=()=>useContext(WorkspaceVisibility);
