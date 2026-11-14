import type {Source} from '../../shared/contracts';
import {LibraryImportDialog} from '../LibraryImportDialog';

/** Compatibility entry: media now uses the same collection importer as files. */
export function SourceMediaImport({onClose}:{onClose:()=>void;onRefresh:()=>Promise<void>;onImported?:(source:Source)=>void}){
  return <LibraryImportDialog onClose={onClose} onDone={root=>{location.hash=`artifacts/${root.id}`;}}/>;
}
