export function HitherMark({className=''}:{className?:string}) {
  return <svg className={`hither-mark secondu-mark ${className}`} viewBox="0 0 36 36" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="3.7" strokeLinecap="round"><path d="M7 7v11c0 7 4.5 11 11 11s11-4 11-11V12"/><path d="M13 7v11c0 3.2 1.8 5 5 5s5-1.8 5-5V7"/></g><circle className="hither-mark-dot" cx="29" cy="6" r="2.1" fill="currentColor"/></svg>;
}
