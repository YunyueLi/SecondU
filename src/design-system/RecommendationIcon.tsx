import { AnalyzeData, BookOpen, Calendar, CalendarToday, Camera, Chat, Clock, Code, ColorTheme, DiningEvents, Document, DollarCircle, Dumbbell, Edit, Education, FilePresentation, Folder, Group, Headphones, Mail, Search, ShoppingBag, Stethoscope, SuitcaseWorkBusiness, Translate, UserHeart, Video } from '@openai/apps-sdk-ui/components/Icon';
import { resolveRecommendationIcon, type RecommendationIconInput, type RecommendationIconName, type ResolvedRecommendationIcon } from '../../shared/recommendation-icons';
import { PlatformIcon } from '../cognition/PlatformIcon';
import './recommendation-icons.css';

const icons={AnalyzeData,BookOpen,Calendar,CalendarToday,Camera,Chat,Clock,Code,ColorTheme,DiningEvents,Document,DollarCircle,Dumbbell,Edit,Education,FilePresentation,Folder,Group,Headphones,Mail,Search,ShoppingBag,Stethoscope,SuitcaseWorkBusiness,Translate,UserHeart,Video} satisfies Record<RecommendationIconName,typeof Chat>;
export function RecommendationIcon({resolved,className='',...input}:RecommendationIconInput&{resolved?:ResolvedRecommendationIcon;className?:string}){
 const result=resolved||resolveRecommendationIcon(input),Icon=result.type==='semantic'?icons[result.icon]:undefined;
 return <span className={`recommendation-icon ${className}`} aria-hidden="true">{result.type==='platform'?<PlatformIcon platform={result.platform}/>:Icon&&<Icon/>}</span>;
}
