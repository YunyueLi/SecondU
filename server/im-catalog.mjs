import path from 'node:path';
import {HttpError} from './store.mjs';

// Fixed official package versions and schemas audited at v2026.9.7.
// The catalogue describes setup paths, not previously authorized user accounts.
export const IM_PLUGIN_INTEGRITIES={
 '@openclaw/feishu':'sha512-bQL/YcdOvXWcPPHKaZBnQEnoHWZZFT0Z6hFg7DrZ2YOMzkxS2ta45TyVKa7JUTJugdbWWp9IIIca2zrLmwqDRQ==',
 '@openclaw/msteams':'sha512-H7q1RCkezWBHTkgrhAk89MSwp5hEQh/cQ5ONYaFYH/ytG41ub7aRozHgXIhEJl4MUdDY9vFgRNWwP8sbi08a/Q==',
 '@openclaw/signal':'sha512-bjS6UM/ZxEVn0L8JUFAesinB9UKwhlX0hr4KOdHlYYfuO8I6kmG5K1tSpCZX5ljkKPivVNjFTV4ybQ6J/CXNzA==',
 '@openclaw/imessage':'sha512-D1khrLM5dT9pTScvhGbnIt9b4swjJiHj3IetdzK2Ui6eMboV1Rd+5KrKPzR6DuEaJTtyBR3U9zh3ab5QH5y9Rg==',
 '@openclaw/matrix':'sha512-reKElt3j7zyOyncrsKetWAzIeKhgI/YNNaajeOb2BmCQ38RGkyrqKW9fJXvvMPytb/aa2O2K1ybQIk2kOy1QyA==',
 '@openclaw/mattermost':'sha512-tGTuZV71jzU26Ts70iFO1C6da1HEasy495yszcOGpDnhV99YdHdUXR73FR5ex+pJTtc6Gd7mOccTU+iJKo/cvg==',
 '@openclaw/googlechat':'sha512-0xULeYr/vvWgPcQ9UBpQRrBKb3kvk1Fkgu0knfyLV62hD70czbxn2e92Gidhv9AvaNLESVOBCRnZm2lRQRsKhg=='
};
export const IM_EXTERNAL_PACKAGES={
 qqbot:{name:'@tencent-connect/openclaw-qqbot',version:'2.0.4',pluginId:'openclaw-qqbot',integrity:'sha512-DkzwP2zUguoj8Gn0ZOcvcAHAT0hsZTMY8acB9Pl/lVtaw4tvzTX5YPF6GWMR0OIWFQspAWUn8RaMypNbBSDIsg=='},
 wecom:{name:'@wecom/wecom-openclaw-plugin',version:'2026.9.15',pluginId:'wecom-openclaw-plugin',integrity:'sha512-TZCDBO00EWOoqgPtyyrr+jsLkJunmUaG641i4CG2sC2sfvoqECXJ12or+ZXp7zJjLgQv1tPwVCxBpgSls2EqWg=='}
};
export const IM_CHANNEL_LIMITATIONS=[
 {channel:'wechat',label:'微信',version:'2.4.9',reason:{zh:'腾讯插件当前没有关闭入站自动处理的配置，不能满足本向导默认不自动回复的范围。可先导入本人导出的聊天文件。',en:'The Tencent plugin does not currently expose a setting to disable automatic inbound handling. This wizard requires manual-only actions. Exported chat files can still be imported.'},docsUrl:'https://docs.openclaw.ai/channels/wechat'},
 {channel:'dingtalk',label:'钉钉',version:'0.8.26',reason:{zh:'钉钉官方插件的私聊策略尚无禁用选项，群聊禁用后仍会自动发送拒绝消息。此版本暂不进入受管运行环境。',en:'The official DingTalk plugin has no disabled DM policy and still sends automatic denial messages for disabled groups. This release is not enabled in the managed runtime.'},docsUrl:'https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector'}
];
const field=(key,label,type='text',extra={})=>({key,label,type,required:true,...extra});
const note=(zh,en)=>({zh,en});
export const IM_CHANNEL_CATALOG=[
 {channel:'slack',label:'Slack',fields:[field('botToken','Bot Token','password',{placeholder:'xoxb-…'}),field('appToken','App Token','password',{placeholder:'xapp-…'})],requirements:[note('创建 Slack 应用并启用 Socket Mode，授予所需会话的读取与发送权限。','Create a Slack app with Socket Mode and grant access to the selected conversations.')]},
 {channel:'discord',label:'Discord',fields:[field('token','Bot Token','password')],requirements:[note('在 Discord Developer Portal 创建机器人，将其加入指定服务器并授予所需权限。','Create a bot in the Discord Developer Portal, invite it to the server and grant the required permissions.')]},
 {channel:'telegram',label:'Telegram',builtin:true,fields:[field('botToken','Bot Token','password')],requirements:[note('通过 BotFather 创建机器人并复制令牌。收件人需要先与机器人建立会话。','Create a bot with BotFather. Recipients must first open a conversation with the bot.')]},
 {channel:'feishu',label:'飞书 / Lark',fields:[field('appId','App ID'),field('appSecret','App Secret','password'),field('domain','Platform','select',{options:[{value:'feishu',label:'飞书'},{value:'lark',label:'Lark'}],defaultValue:'feishu'})],requirements:[note('创建企业自建应用并开启机器人，发布相应权限。此向导使用官方长连接，无需公网 webhook。','Create and publish an enterprise bot app with the required permissions. This setup uses the official WebSocket connection, without a public webhook.')]},
 {channel:'qqbot',label:'QQ',defaultAtRoot:true,fields:[field('appId','App ID'),field('clientSecret','App Secret','password')],requirements:[note('在 QQ 开放平台创建机器人，使用 AppID 与 AppSecret。目标使用对应私聊或群聊 OpenID，历史消息读取未适配。','Create a bot on the QQ Open Platform using its AppID and AppSecret. Destinations use the corresponding direct-chat or group OpenID; history import is not adapted.')]},
 {channel:'wecom',label:'企业微信',fields:[field('botId','Bot ID'),field('secret','Bot Secret','password')],requirements:[note('在企业微信创建智能机器人并选择长连接，填入 Bot ID 与 Secret。手动发送仍受原平台机器人会话和发送权限限制。','Create a WeCom smart bot with WebSocket mode and supply its Bot ID and Secret. Manual sending remains subject to the platform’s conversation and sending permissions.')]},
 {channel:'whatsapp',label:'WhatsApp',authorizationMode:'qr',fields:[],requirements:[note('使用本人 WhatsApp 的关联设备功能扫描临时二维码。','Scan the temporary QR code with Linked devices in your own WhatsApp account.')]},
 {channel:'msteams',label:'Microsoft Teams',singleAccount:true,fields:[field('appId','Azure App ID'),field('appPassword','Client Secret','password'),field('tenantId','Tenant ID')],requirements:[note('先注册 Azure Bot 与 Teams 应用。接收事件需已有安全 HTTPS webhook 配置；SecondU 不自动开放公网端口。','Register an Azure Bot and Teams app. Receiving events requires an existing secure HTTPS webhook; SecondU does not expose a public port.') ]},
 {channel:'signal',label:'Signal',authorizationMode:'external',fields:[field('phoneNumber','Phone number','text',{placeholder:'+15551234567'}),field('serviceUrl','Local signal-cli service','url',{placeholder:'http://127.0.0.1:8080'})],requirements:[note('先在本机 signal-cli 完成本人设备关联，并启动本机 HTTP 服务。这里复用该已授权服务，不替你注册或接收验证码。','Link your own account with signal-cli and run its local HTTP service. This connector reuses that authorized service; it does not register an account or handle verification codes.')]},
 {channel:'imessage',label:'iMessage',authorizationMode:'external',platform:'darwin',fields:[field('cliPath','imsg executable','text',{placeholder:'/opt/homebrew/bin/imsg'}),field('dbPath','Messages database','text',{required:false})],requirements:[note('需要已登录「信息」的 Mac、imsg 和本人授予的系统权限。工具安装和系统授权按官方说明完成。','Requires a Mac signed into Messages, imsg, and macOS permissions granted by you. Complete tool installation and system authorization using the official guide.')]},
 {channel:'matrix',label:'Matrix',fields:[field('homeserver','Homeserver','url',{placeholder:'https://matrix.example.com'}),field('userId','User ID','text',{placeholder:'@user:example.com'}),field('accessToken','Access Token','password')],requirements:[note('使用已有 Matrix 账号令牌。此向导不启用端到端加密房间的设备验证。','Use an existing Matrix account token. This setup does not enable device verification for end-to-end encrypted rooms.')]},
 {channel:'mattermost',label:'Mattermost',fields:[field('baseUrl','Server URL','url',{placeholder:'https://chat.example.com'}),field('botToken','Bot Token','password')],requirements:[note('在 Mattermost 创建机器人账号，并允许访问所选频道。','Create a Mattermost bot account and grant access to the selected channel.')]},
 {channel:'googlechat',label:'Google Chat',fields:[field('serviceAccount','Service account JSON','textarea'),field('audience','App URL or project number'),field('audienceType','Audience type','select',{defaultValue:'app-url',options:[{value:'app-url',label:'App URL'},{value:'project-number',label:'Project number'}]})],requirements:[note('需要 Google Chat 应用和服务账号。接收事件需已有 HTTPS webhook；凭据 JSON 仅保存到本机。','Requires a Google Chat app and service account. Receiving events requires an existing HTTPS webhook; credential JSON is stored locally only.')]}
].map(item=>({...item,canRead:['slack','discord'].includes(item.channel),canSend:true,auth:item.authorizationMode==='qr'?'qr':'token',authorizationMode:item.authorizationMode??'credentials',docsUrl:`https://docs.openclaw.ai/channels/${item.channel}`}));
const fail=message=>{throw new HttpError(400,message,'im_setup_invalid');};
function plain(value,label,max=2000){if(typeof value!=='string'||!value.trim()||value.length>max||/[\0\r\n]/.test(value))fail(`${label} 无效。`);return value.trim();}
function url(value,label,{local=false}={}){const raw=plain(value,label);let parsed;try{parsed=new URL(raw);}catch{fail(`${label} 无效。`);}if(parsed.username||parsed.password||parsed.hash||!['https:','http:'].includes(parsed.protocol))fail(`${label} 无效。`);if(local&&!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))fail('Signal 服务必须位于本机。');if(!local&&parsed.protocol!=='https:')fail('服务地址必须使用 HTTPS。');return raw;}

export function managedChannelConfig(channel,body,{platform=process.platform}={}){
 const item=IM_CHANNEL_CATALOG.find(item=>item.channel===channel);if(!item)fail('通信渠道未适配。');if(item.platform&&item.platform!==platform)fail('iMessage 需要在 macOS 上运行。');if(item.singleAccount&&(body.accountId??'default')!=='default')fail('此渠道在当前向导中使用 default 账号。');
 const entry={enabled:true,dmPolicy:'disabled',groupPolicy:'disabled'};
 for(const spec of item.fields){const input=body[spec.key]??spec.defaultValue;if((input===undefined||input==='')&&!spec.required)continue;if(spec.key==='serviceAccount')continue;let value=spec.type==='url'?url(input,spec.label,{local:channel==='signal'}):plain(input,spec.label);if(spec.options&&!spec.options.some(option=>option.value===value))fail(`${spec.label} 无效。`);entry[spec.key]=value;}
 if(channel==='slack'){if(!entry.botToken.startsWith('xoxb-')||!entry.appToken.startsWith('xapp-'))fail('请填写 Slack Bot Token 与 App Token。');entry.mode='socket';entry.dm={enabled:false};}
 if(channel==='discord')entry.dm={enabled:false};
 if(channel==='telegram'&&!/^\d+:[A-Za-z0-9_-]+$/.test(entry.botToken))fail('Telegram Bot Token 格式无效。');
 if(channel==='feishu')entry.connectionMode='websocket';
 if(channel==='qqbot')entry.allowFrom=['openclaw:approval-disabled'];
 if(channel==='wecom'){entry.connectionMode='websocket';entry.sendThinkingMessage=false;entry.dynamicAgents={enabled:false};}
 if(channel==='whatsapp')entry.sendReadReceipts=false;
 if(channel==='msteams')entry.authType='secret';
 if(channel==='signal'){if(!/^\+[1-9]\d{5,14}$/.test(entry.phoneNumber))fail('Signal 账号需使用完整国际号码。');entry.account=entry.phoneNumber;entry.transport={kind:'external-native',url:entry.serviceUrl};delete entry.phoneNumber;delete entry.serviceUrl;entry.sendReadReceipts=false;}
 if(channel==='imessage'){if(!path.isAbsolute(entry.cliPath)||entry.dbPath&&!path.isAbsolute(entry.dbPath))fail('iMessage 工具与资料路径必须是本机绝对路径。');entry.includeAttachments=false;entry.sendReadReceipts=false;entry.catchup={enabled:false};}
 if(channel==='matrix'){delete entry.dmPolicy;entry.dm={enabled:false,policy:'disabled'};entry.autoJoin='off';entry.encryption=false;entry.joinIntro=false;}
 if(channel==='mattermost')entry.chatmode='oncall';
 if(channel==='googlechat'){
  let credential;try{if(typeof body.serviceAccount!=='string'||body.serviceAccount.length>24000)throw new Error();credential=JSON.parse(body.serviceAccount);}catch{fail('Google 服务账号 JSON 无效。');}
  if(credential.type!=='service_account'||typeof credential.client_email!=='string'||!credential.client_email.endsWith('.gserviceaccount.com')||typeof credential.private_key!=='string'||!credential.private_key.includes('BEGIN PRIVATE KEY')||credential.token_uri!=='https://oauth2.googleapis.com/token')fail('请使用标准 Google 服务账号 JSON。');
  entry.serviceAccount=JSON.stringify(credential);
 }
 return {item,entry};
}
