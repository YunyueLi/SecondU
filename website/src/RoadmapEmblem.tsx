import understanding from '../public/art/roadmap/understanding-v1.png';
import growth from '../public/art/roadmap/growth-v1.png';
import devices from '../public/art/roadmap/devices-v1.png';
import capabilities from '../public/art/roadmap/capabilities-v1.png';
import relationships from '../public/art/roadmap/relationships-v1.png';

const illustrations=[understanding,growth,devices,capabilities,relationships];

export default function RoadmapEmblem({stage}:{stage:number}){
 return <img className={`future-emblem future-emblem-${stage}`} src={illustrations[stage]} alt="" loading="lazy" decoding="async" draggable={false}/>;
}
