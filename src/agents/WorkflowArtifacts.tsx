import {useState} from 'react';
import {ChevronRightIcon} from 'lucide-react';
import type {Artifact} from '../../shared/contracts';
import {t} from '../i18n';
import {WorkflowCompletionArtifacts,completionArtifactLayout} from './zcode/components/workflow-timeline/WorkflowCompletionArtifacts';
import {WorkflowArtifactIndex} from './zcode/components/workflow-timeline/WorkflowArtifactIndex';
import {WorkflowArtifactRow} from './zcode/components/workflow-timeline/WorkflowArtifactRow';
import {buildPresetLabels} from './zcode/app-shell/workflow-artifacts/artifactPresentation';
import {useZCodeIntl} from './zcode/i18n/IntlProvider';
import {zcodeArtifacts,zcodeArtifactPreview} from './zcodeAdapter';
export function WorkflowArtifacts({artifacts,primaryId,onOpen,compact=false}:{artifacts:Artifact[];primaryId?:string;onOpen?:(id:string)=>void;compact?:boolean}){
  const [open,setOpen]=useState(true),{intl}=useZCodeIntl();
  if(!artifacts.length)return null;
  const items=zcodeArtifacts(artifacts,primaryId),layout=completionArtifactLayout(items,false),labels=buildPresetLabels(intl.formatMessage),preview=(item:{id:string})=>zcodeArtifactPreview(artifacts.find(f=>f.id===item.id));
  if(compact)return <div className="zcode-workflow"><WorkflowCompletionArtifacts labels={labels} layout={layout} artifactsTruncated={false} onOpenArtifact={onOpen} renderPreview={preview}/></div>;
  return <section className="zcode-workflow border-t border-border"><button type="button" className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-ui-sm text-foreground-subtle" onClick={()=>setOpen(!open)} aria-expanded={open}><ChevronRightIcon className={`size-3.5 transition-transform ${open?'rotate-90':''}`}/><span>{t('产物','Artifacts')}</span><span className="font-mono text-ui-xs">{items.length}</span></button>{open&&<div className="flex flex-col gap-2.5 px-4 pb-3">{layout.primary&&<WorkflowArtifactRow artifact={layout.primary} labels={labels} onOpen={onOpen} preview={preview(layout.primary)}/>}<WorkflowArtifactIndex artifacts={items.filter(f=>f!==layout.primary)} labels={labels} columns="one" rule={!!layout.primary} onOpenArtifact={onOpen}/></div>}</section>;
}
