/** Display preferences never rewrite the canonical name or source records. */
export function displayProfileName(profile,locale='zh-CN') {
  return locale==='en'&&typeof profile.englishName==='string'&&profile.englishName.trim()?profile.englishName.trim():profile.name;
}
