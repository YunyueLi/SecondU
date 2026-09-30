import { brand } from './brand';

/** A local vector wordmark; the symbol remains independent at small sizes. */
export function HitherWordmark({className=''}:{className?:string}) {
  return <span className={`hither-wordmark secondu-wordmark ${className}`} role="img" aria-label={brand.name} style={{maskImage:`url("${brand.wordmark}")`,WebkitMaskImage:`url("${brand.wordmark}")`}}/>;
}
