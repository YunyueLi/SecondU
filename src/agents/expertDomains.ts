/** Stable role IDs map to browsing domains; names and saved instructions stay independent. */
export const EXPERT_DOMAINS = [
  {id:'product',label:{zh:'产品设计',en:'Product and design'},section:'work',roles:['product-review','user-research','requirements-analyst','customer-insight','ux-flow','information-architect','design-system','visual-brief','brand-identity','prototype-builder','motion-designer']},
  {id:'engineering',label:{zh:'技术工程',en:'Engineering'},section:'work',roles:['frontend-engineer','backend-engineer','system-architect','devops-reviewer','database-designer','code-migration','api-writer']},
  {id:'games',label:{zh:'游戏空间',en:'Games and spatial'},section:'work',roles:['game-systems','level-designer','game-narrative','spatial-experience']},
  {id:'data',label:{zh:'数据智能',en:'Data and intelligence'},section:'work',roles:['data-analyst','spreadsheet-specialist','data-cleaner','metrics-designer','experiment-analyst','data-visualizer','sql-reviewer','tracking-designer','survey-analyst']},
  {id:'marketing',label:{zh:'营销增长',en:'Marketing and growth'},section:'work',roles:['growth-planner','market-plan','community-manager']},
  {id:'creation',label:{zh:'内容创作',en:'Content creation'},section:'work',roles:['writing-editor','presentation-designer','scriptwriter','brand-voice','content-planner','translator','technical-writer','fiction-coach','podcast-planner','photo-project']},
  {id:'sales',label:{zh:'销售商务',en:'Sales and business'},section:'work',roles:['sales-proposal','customer-success','supplier-compare','negotiation-prep']},
  {id:'finance',label:{zh:'金融投资',en:'Finance and investing'},section:'work',roles:['financial-modeler','budget-reviewer','company-research','unit-economics','pricing-analyst','household-budget']},
  {id:'operations',label:{zh:'运营人力',en:'Operations and people'},section:'work',roles:['resume-editor','interview-coach','portfolio-coach','career-planner','networking-prep','onboarding-coach','performance-review','job-research','operations-planner','meeting-recorder','volunteer-planner']},
  {id:'quality',label:{zh:'项目质量',en:'Projects and quality'},section:'work',roles:['project-planner','process-designer','test-engineer','accessibility-auditor','usability-auditor','ai-evaluator']},
  {id:'legal',label:{zh:'法务安全',en:'Legal and security'},section:'work',roles:['contract-clause-reviewer','privacy-planner','compliance-coordinator','ip-research','contract-reader','security-reviewer']},
  {id:'industry',label:{zh:'行业顾问',en:'Industry advisers'},section:'work',roles:['decision-facilitator','knowledge-curator','evidence-researcher','competitive-analyst','trend-analyst','historical-researcher','fieldnote-designer']},
  {id:'global',label:{zh:'全球发展',en:'Global business'},section:'work',roles:['localization-editor','global-market','cross-border-ops','multilingual-comms']},
  {id:'education',label:{zh:'教育学习',en:'Education and learning'},section:'life',roles:['learning-coach','english-coach','math-coach','programming-tutor','exam-planner','reading-coach','spaced-reviewer','lesson-designer','study-note-maker','literature-reviewer','paper-reader','research-proposal','language-journey','music-practice','makers-guide']},
  {id:'life',label:{zh:'日常生活',en:'Everyday life'},section:'life',roles:['life-planner','moving-planner','garden-care','pet-care','home-organizer','hobby-planner','home-improvement','personal-archive','event-planner']},
  {id:'health',label:{zh:'健康照护',en:'Health and care'},section:'life',roles:['meal-planner','fitness-planner','care-coordination']},
  {id:'travel',label:{zh:'出行探索',en:'Travel and exploration'},section:'life',roles:['travel-planner','travel-journal']},
  {id:'relationships',label:{zh:'人际关系',en:'Relationships'},section:'life',roles:['conversation-coach','family-planner','celebration-planner','gift-planner','conflict-prep','boundary-coach','reflection-partner']},
] as const;
export const expertDomainById:Record<string,string>=Object.fromEntries(EXPERT_DOMAINS.flatMap(domain=>domain.roles.map(id=>[id,domain.id])));
