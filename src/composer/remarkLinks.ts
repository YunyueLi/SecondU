import {findLinks} from './linkify.ts';

interface MarkdownNode {type:string;value?:string;url?:string;children?:MarkdownNode[];position?:{start:{offset?:number};end:{offset?:number}}}
const protectedNodes=new Set(['link','linkReference','image','imageReference','code','inlineCode','html']);

function linkedText(value:string):MarkdownNode[]{
  const links=findLinks(value).filter(link=>value[link.start]!=='[');
  if(!links.length)return [{type:'text',value}];
  const nodes:MarkdownNode[]=[];let cut=0;
  for(const link of links){
    if(link.start>cut)nodes.push({type:'text',value:value.slice(cut,link.start)});
    nodes.push({type:'link',url:link.href,children:[{type:'text',value:value.slice(link.start,link.end)}]});
    cut=link.end;
  }
  if(cut<value.length)nodes.push({type:'text',value:value.slice(cut)});
  return nodes;
}

/** Keep the SDK's Markdown parser, and apply Greenroom's URL boundaries only to
 * bare text. Explicit Markdown links, code and image syntax remain unchanged. */
export function remarkHitherLinks(){
  return (tree:MarkdownNode,file:{value?:unknown})=>{
    const source=String(file.value??'');
    function visit(parent:MarkdownNode){
      if(!parent.children||protectedNodes.has(parent.type))return;
      parent.children=parent.children.flatMap(node=>{
        if(node.type==='text')return linkedText(node.value||'');
        if(node.type==='link'&&node.position){
          const original=source.slice(node.position.start.offset,node.position.end.offset);
          // GFM can already have swallowed Chinese prose after a URL. Only its
          // bare autolinks need re-splitting; [label](url) and <url> are explicit.
          if(/^(?:https?:\/\/|www\.)/.test(original))return linkedText(original);
        }
        visit(node);return [node];
      });
    }
    visit(tree);
  };
}
