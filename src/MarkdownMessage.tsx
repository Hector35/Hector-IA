import type {ReactNode} from 'react';

function inlineMarkdown(text:string):ReactNode[]{
  const pattern=/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g;
  return text.split(pattern).filter(Boolean).map((part,index)=>{
    if(part.startsWith('**')&&part.endsWith('**'))return <strong key={index}>{part.slice(2,-2)}</strong>;
    if(part.startsWith('`')&&part.endsWith('`'))return <code key={index}>{part.slice(1,-1)}</code>;
    const link=part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if(link)return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return part;
  });
}

export function MarkdownMessage({content}:{content:string}){
  const lines=content.replace(/\r/g,'').split('\n');
  const nodes:ReactNode[]=[];
  let code:string[]=[];
  let inCode=false;
  const flushCode=()=>{if(code.length){nodes.push(<pre key={`code-${nodes.length}`}><code>{code.join('\n')}</code></pre>);code=[];}};
  lines.forEach((line,index)=>{
    if(line.trim().startsWith('```')){if(inCode){flushCode();inCode=false}else inCode=true;return;}
    if(inCode){code.push(line);return;}
    if(!line.trim()){nodes.push(<div className="cxMdSpace" key={`space-${index}`}/>);return;}
    const heading=line.match(/^(#{1,3})\s+(.+)$/);
    if(heading){const level=heading[1].length;const body=inlineMarkdown(heading[2]);nodes.push(level===1?<h1 key={index}>{body}</h1>:level===2?<h2 key={index}>{body}</h2>:<h3 key={index}>{body}</h3>);return;}
    const bullet=line.match(/^\s*[-*]\s+(.+)$/);
    if(bullet){nodes.push(<div className="cxMdBullet" key={index}><span>•</span><p>{inlineMarkdown(bullet[1])}</p></div>);return;}
    const numbered=line.match(/^\s*(\d+)\.\s+(.+)$/);
    if(numbered){nodes.push(<div className="cxMdBullet" key={index}><span>{numbered[1]}.</span><p>{inlineMarkdown(numbered[2])}</p></div>);return;}
    nodes.push(<p key={index}>{inlineMarkdown(line)}</p>);
  });
  if(inCode)flushCode();
  return <div className="cxMarkdown">{nodes}</div>;
}
