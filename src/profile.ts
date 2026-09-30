import type { Profile } from '../shared/contracts';
import { displayProfileName as profileName } from '../shared/profile-name.mjs';
import { getLocale } from './i18n';
export const displayProfileName=(profile:Pick<Profile,'name'|'englishName'|'demo'>)=>profileName(profile,getLocale());
