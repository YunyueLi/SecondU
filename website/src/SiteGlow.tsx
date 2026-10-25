import {ActivityEdge} from '../../src/design-system/ActivityEdge';
import {useSiteMotion} from './site-motion';

/** The same spectrum material as the product's expressive thinking state. */
export default function SiteGlow({radius=16,active=true}:{radius?:number;active?:boolean}){
 const {paused}=useSiteMotion();
 return <span className="site-glow" aria-hidden="true"><ActivityEdge active={active} radius={radius} intensity="subtle" palette="spectrum" paused={paused}/></span>;
}
