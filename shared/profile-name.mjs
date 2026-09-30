/** Only fictional demo profiles have localized display names. */
export function displayProfileName(profile,locale='zh-CN') {
  return profile.demo===true&&locale==='en'&&typeof profile.englishName==='string'&&profile.englishName.trim()?profile.englishName.trim():profile.name;
}
