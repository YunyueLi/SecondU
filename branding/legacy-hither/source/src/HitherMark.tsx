export function HitherMark({className=''}:{className?:string}) {
  return <svg className={`hither-mark ${className}`} viewBox="0 0 36 36" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round"><path d="M8 6v23"/><path d="M8 21c0-12 20-12 20 0v8"/></g><circle className="hither-mark-dot" cx="28" cy="5.5" r="2.5" fill="currentColor"/></svg>;
}
