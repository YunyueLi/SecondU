import './spot-illustration.css';

type PaperScene='conversation'|'archive'|'milestone'|'rhythm';

export function SpotIllustration({scene,className=''}:{scene:PaperScene;className?:string}) {
  return <img className={`spot-illustration ${className}`} src={`/art/paper-${scene}.png`} alt="" aria-hidden="true" draggable={false} decoding="async"/>;
}
