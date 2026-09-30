// First-party service references checked on 2026-09-30. No account is connected
// merely because it appears here; runtime status comes only from saved bindings.
export const CONNECTOR_CATALOG_CHECKED_AT = '2026-09-30';
export const CONNECTOR_CATEGORIES = [
  { id: 'all', zh: '全部', en: 'All' }, { id: 'productivity', zh: '文档与效率', en: 'Productivity' },
  { id: 'communication', zh: '沟通与日程', en: 'Communication' }, { id: 'development', zh: '开发与研究', en: 'Development' },
  { id: 'design', zh: '设计', en: 'Design' }, { id: 'business', zh: '业务与客户', en: 'Business' },
];
const service = (id, name, category, description, descriptionEn, endpoint, authMethods, docsUrl, extra = {}) => ({ id, name, category, description, descriptionEn, endpoint, authMethods, docsUrl, ...extra });
const googleDocs = 'https://developers.google.com/workspace/guides/configure-mcp-servers';
const google = (id, name, category, description, descriptionEn, host, scopes) => service(id, name, category, description, descriptionEn, `https://${host}.googleapis.com/mcp/v1`, ['oauth','bearer'], googleDocs, { icon: id, oauthRegistration: 'manual', preview: true, scopes, setupUrl: 'https://console.cloud.google.com/apis/credentials', requirement: '需要 Google Workspace 开发者预览资格、自有 Cloud 项目、已启用的 API，以及该项目的 OAuth 应用。', requirementEn: 'Requires Workspace Developer Preview access, an enabled Cloud project, and your own OAuth application.' });
const microsoft = (id, name, description, descriptionEn, server, doc) => service(id, name, id.includes('mail') || id.includes('calendar') || id === 'teams' ? 'communication' : 'productivity', description, descriptionEn, '', ['oauth','bearer'], `https://learn.microsoft.com/en-us/microsoft-copilot-studio/${doc}`, { icon: id, endpointTemplate: `https://agent365.svc.cloud.microsoft/agents/tenants/{tenantId}/servers/${server}`, oauthRegistration: 'manual', preview: true, setupUrl: 'https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/mcp-authentication', requirement: '需要具备 Work IQ / Agent 365 预览资格的组织租户、管理员授予的服务权限和自己的 Entra OAuth 应用。', requirementEn: 'Requires an eligible Work IQ / Agent 365 preview tenant, administrator-granted server permissions, and your own Entra OAuth app.' });

export const CONNECTOR_CATALOG = [
  google('gmail', 'Gmail', 'communication', '查找邮件、阅读会话和准备邮件草稿。', 'Find email, read threads, and prepare drafts.', 'gmailmcp', ['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.compose']),
  google('google-drive', 'Google Drive', 'productivity', '查找、读取和整理云端文件。', 'Find, read, and organize cloud files.', 'drivemcp', ['https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/drive.file']),
  google('google-calendar', 'Google Calendar', 'communication', '查询日程和空闲时间。', 'Check your schedule and availability.', 'calendarmcp', ['https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.events.freebusy']),
  service('notion','Notion','productivity','搜索工作区，阅读与更新页面和数据库。','Search your workspace and work with pages and databases.','https://mcp.notion.com/mcp',['oauth'],'https://developers.notion.com/guides/mcp/get-started-with-mcp',{oauthRegistration:'dynamic',icon:'notion'}),
  service('slack','Slack','communication','查找团队讨论，阅读频道并处理消息。','Find discussions, read channels, and work with messages.','https://mcp.slack.com/mcp',['oauth','bearer'],'https://docs.slack.dev/ai/slack-mcp-server/',{oauthRegistration:'manual',icon:'slack',setupUrl:'https://api.slack.com/apps',requirement:'需要自己的 Slack 内部应用或已上架应用，并由工作区管理员批准；不使用其他产品的应用身份。',requirementEn:'Requires your own internal or published Slack app and workspace administrator approval.'}),
  service('github','GitHub','development','查看代码仓库、议题、拉取请求和工作流。','Work with repositories, issues, pull requests, and workflows.','https://api.githubcopilot.com/mcp/',['bearer'],'https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md',{icon:'github',setupUrl:'https://github.com/settings/personal-access-tokens',requirement:'使用你自己创建、限定仓库与权限的 GitHub 访问令牌。',requirementEn:'Use your own GitHub personal access token with the required repository permissions.'}),
  service('linear','Linear','productivity','查找与更新议题、项目和工作进展。','Find and update issues, projects, and progress.','https://mcp.linear.app/mcp',['oauth','bearer'],'https://linear.app/docs/mcp',{oauthRegistration:'dynamic',icon:'linear',scopes:['read']}),
  service('atlassian','Atlassian','productivity','连接 Jira、Confluence 与团队工作资料。','Connect Jira, Confluence, and your team’s work.','https://mcp.atlassian.com/v2/mcp',['oauth','bearer'],'https://support.atlassian.com/atlassian-ai-gateway/docs/get-started-with-the-atlassian-remote-mcp-server/',{oauthRegistration:'dynamic',icon:'atlassian',requirement:'遵循组织的应用访问策略；部分检索会使用 Rovo 额度。Bearer 方式需要管理员创建的服务账号 API key。',requirementEn:'Organization policies apply. Some searches use Rovo credits. Bearer authentication requires an administrator-managed service account API key.'}),
  service('asana','Asana','productivity','规划任务与项目，追踪负责人和进度。','Plan tasks and projects and track ownership and progress.','https://mcp.asana.com/v2/mcp',['oauth'],'https://developers.asana.com/docs/integrating-with-asanas-mcp-server',{oauthRegistration:'manual',icon:'asana',setupUrl:'https://app.asana.com/0/my-apps',requirement:'需要在 Asana 注册 MCP 应用，配置当前电脑的回调地址；工作区需允许该应用。',requirementEn:'Register an Asana MCP app with this computer’s callback URL and allow it in your workspace.'}),
  service('figma','Figma','design','读取设计上下文、组件和画布资料。','Read design context, components, and canvas information.','https://mcp.figma.com/mcp',['oauth'],'https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/',{oauthRegistration:'manual',icon:'figma',providerReview:true,requirement:'Figma 目前限制可接入的客户端。SecondU 需先通过 Figma 的客户端准入；已有受支持本机服务也可从自定义 MCP 连接。',requirementEn:'Figma restricts supported MCP clients. SecondU needs provider approval before remote account authorization.'}),
  service('canva','Canva','design','查找设计，使用品牌素材并编辑视觉内容。','Find designs and work with brand assets and visual content.','https://mcp.canva.com/mcp',['oauth'],'https://www.canva.dev/docs/apps/quickstart/',{oauthRegistration:'manual',icon:'canva',providerReview:true,requirement:'需要 Canva MCP 应用准入和自己的 OAuth 客户端。服务商完成准入后可在这里配置授权。',requirementEn:'Requires Canva MCP client approval and your own OAuth client before account authorization.'}),
  service('miro','Miro','design','阅读白板内容，整理想法与协作图表。','Read boards and organize ideas and collaborative diagrams.','https://mcp.miro.com',['oauth'],'https://developers.miro.com/docs/miro-mcp-server-frequently-asked-questions',{oauthRegistration:'dynamic',icon:'miro'}),
  service('hubspot','HubSpot','business','查询与更新客户、交易和业务记录。','Query and update customers, deals, and business records.','https://mcp.hubspot.com',['oauth'],'https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server',{oauthRegistration:'manual',icon:'hubspot',requirement:'先在 HubSpot 创建 MCP Auth App，再填写该应用的 Client ID 与 Client Secret。',requirementEn:'Create a HubSpot MCP Auth App, then enter its client ID and client secret.'}),
  service('stripe','Stripe','business','查询 Stripe 资料和业务数据。','Explore Stripe resources and business data.','https://mcp.stripe.com',['oauth','bearer'],'https://docs.stripe.com/agents',{oauthRegistration:'dynamic',icon:'stripe',requirement:'账号权限和 Stripe 费用规则照常适用；涉及外部修改的工具需逐次确认。',requirementEn:'Your account permissions and Stripe billing apply. External tool calls require confirmation.'}),
  service('hugging-face','Hugging Face','development','搜索模型、数据集、论文和 AI 应用。','Search models, datasets, papers, and AI applications.','https://huggingface.co/mcp',['none','bearer'],'https://huggingface.co/docs/hub/agents-mcp',{icon:'huggingface',requirement:'公共 Hub 工具可匿名连接；自定义工具及账号资源可使用自己的访问令牌。',requirementEn:'Public Hub tools support anonymous access. Use your own token for account-specific tools.'}),
  service('context7','Context7','development','查阅软件库的当前文档与代码示例。','Find current library documentation and code examples.','https://mcp.context7.com/mcp',['none','bearer'],'https://context7.com/docs/clients/cursor',{icon:'context7',requirement:'可先连接公共服务；需要更高配额时填写自己的 API key。',requirementEn:'Connect publicly, or provide your own API key for account quotas.'}),
  service('microsoft-learn','Microsoft Learn','development','查询 Microsoft 官方技术文档。','Search official Microsoft technical documentation.','https://learn.microsoft.com/api/mcp',['none'],'https://learn.microsoft.com/en-us/training/support/mcp',{icon:'microsoft',requirement:'仅提供公开文档，不访问 Microsoft 账号或组织资料。',requirementEn:'Provides public documentation only, without access to account or organization data.'}),
  google('google-docs','Google Docs','productivity','读取和编辑 Google 文档。','Read and edit Google documents.','docsmcp',['https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/documents.readonly','https://www.googleapis.com/auth/documents']),
  google('google-sheets','Google Sheets','productivity','阅读表格，处理单元格、公式与结构。','Read sheets and work with cells, formulas, and structure.','sheetsmcp',['https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/spreadsheets.readonly','https://www.googleapis.com/auth/spreadsheets']),
  google('google-slides','Google Slides','productivity','读取与修改演示文稿。','Read and update presentations.','slidesmcp',['https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/presentations.readonly','https://www.googleapis.com/auth/presentations']),
  google('google-chat','Google Chat','communication','查找会话，阅读和准备团队消息。','Find conversations and work with team messages.','chatmcp',['https://www.googleapis.com/auth/chat.messages.readonly','https://www.googleapis.com/auth/chat.spaces.readonly','https://www.googleapis.com/auth/chat.memberships.readonly','https://www.googleapis.com/auth/chat.messages.create']),
  google('google-contacts','Google Contacts','communication','搜索联系人和组织通讯录。','Search contacts and your organization directory.','people',['https://www.googleapis.com/auth/contacts.readonly','https://www.googleapis.com/auth/directory.readonly']),
  microsoft('outlook-mail','Outlook Mail','查找邮件、准备草稿和处理会话。','Find mail, prepare drafts, and work with email threads.','mcp_MailTools','mcp-mail-tools'),
  microsoft('outlook-calendar','Outlook Calendar','查询空闲时间，阅读和安排日程。','Explore availability and manage calendar events.','mcp_CalendarTools','mcp-calendar-tools'),
  microsoft('teams','Microsoft Teams','查找聊天、频道与团队消息。','Work with team chats, channels, and messages.','mcp_TeamsServer','mcp-teams-tools'),
  microsoft('onedrive','OneDrive','查找与整理个人工作文件。','Find and organize personal work files.','mcp_OneDriveRemoteServer','mcp-onedrive-tools'),
  microsoft('sharepoint','SharePoint','阅读组织站点与共享资料。','Read organization sites and shared content.','mcp_SharePointRemoteServer','mcp-sharepoint-work-iq'),
  service('feishu','飞书 / Lark','communication','连接飞书消息、文档、表格和日程。','Connect Lark messages, documents, tables, and calendars.','',['oauth','none'],'https://github.com/larksuite/lark-openapi-mcp/blob/main/docs/usage/configuration/configuration.md',{icon:'feishu',localServer:true,requirement:'使用飞书官方 lark-mcp 本机服务。先配置自己的飞书应用并启动 Streamable HTTP 服务，再填写实际地址；用户身份 OAuth 仅支持本机服务。',requirementEn:'Use the official local lark-mcp service with your own Lark app. Enter its running Streamable HTTP address. User OAuth currently requires localhost.'}),
];

export function findCatalogService(connector) {
  if (connector.kind !== 'mcp_http' || !connector.url) return undefined;
  let url;
  try { url = new URL(connector.url); } catch { return undefined; }
  if (url.username || url.password || url.search || url.hash) return undefined;
  const matches = item => {
    if (item.endpoint) return new URL(item.endpoint).href === url.href;
    if (item.endpointTemplate) {
      const tenant = /\/tenants\/([0-9a-f-]+)\//i.exec(url.pathname)?.[1];
      return !!tenant && resolveCatalogEndpoint(item, tenant) === url.href;
    }
    return item.localServer && connector.catalogId === item.id && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  };
  return CONNECTOR_CATALOG.find(item => (!connector.catalogId || connector.catalogId === item.id) && matches(item));
}
export function resolveCatalogEndpoint(service, tenantId = '') {
  if (!service.endpointTemplate) return service.endpoint;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) return '';
  return service.endpointTemplate.replace('{tenantId}', tenantId);
}
