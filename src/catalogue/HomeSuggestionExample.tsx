import { useRef, useState, type MouseEvent } from 'react';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { HomeSuggestions } from '../home/HomeSuggestions';
import type { HomeSuggestionData } from '../home/home-suggestions.mjs';
import { t } from '../i18n';

export function HomeSuggestionExample() {
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const time = '2026-10-24T09:00:00.000Z';
  const examples = [
    { id: 'feedback', title: t('整理反馈，确定下次改进的重点', 'Review feedback and choose the next improvements'), description: t('虚构示例：先把反馈按使用场景归类，再挑出需要进一步确认的问题。', 'Fictional example: group feedback by usage scenario, then identify questions to clarify.') },
    { id: 'weekend', title: t('安排一个留有余地的周末', 'Plan a weekend with room to spare'), description: t('虚构示例：只安排一项主要活动，并为交通与休息留出时间。', 'Fictional example: choose one main activity and allow time for travel and rest.') },
    { id: 'demo', title: t('准备三分钟的功能演示', 'Prepare a three-minute feature demo'), description: t('虚构示例：从用户的问题出发，展示输入、过程与成果。', 'Fictional example: start with the user’s problem, then show the input, process and result.') },
  ];
  const data: HomeSuggestionData = {
    profile: { name: 'Catalogue', description: '', demo: false }, tasks: [], projects: [], facts: [],
    goals: examples.map(item => ({ id: `catalogue-home-goal-${item.id}`, title: item.title, description: item.description, status: 'active', sourceIds: [`catalogue-home-source-${item.id}`], createdAt: time, updatedAt: time })),
    sources: examples.map(item => ({ id: `catalogue-home-source-${item.id}`, title: t('组件目录的虚构笔记', 'Fictional catalogue note'), kind: 'note', text: item.description + (item.id === 'feedback' ? t('\n\n下方 GitHub 链接是公开项目参考；这段虚构笔记不来自该仓库。', '\n\nThe GitHub link below is a public project reference. This fictional note was not extracted from the repository.') : ''), demo: true, createdAt: time })),
    dailyActivities: [{ id: 'catalogue-home-public-reference', kind: 'manual', title: t('SecondU 公开项目参考', 'SecondU public project reference'), summary: t('公开项目链接用于展示品牌来源入口；虚构笔记不来自该仓库。', 'A public project link demonstrates the brand reference. The fictional note was not extracted from the repository.'), status: 'recorded', sourceIds: ['catalogue-home-source-feedback'], sourceUrl: 'https://github.com/YunyueLi/SecondU', demo: true }],
  };

  function keepExampleLocal(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
    if (!target) return;
    event.preventDefault();
    setNotice(t('这是组件目录中的虚构记录；完整示例文字已显示在来源详情中。', 'This is a fictional catalogue record. Its complete example text is shown in the source details.'));
  }

  return <div className="catalogue-home-suggestions" onClickCapture={keepExampleLocal}>
    <HomeSuggestions data={data} persist={false} onDraft={prompt => { setDraft(current => current.trim() ? `${current.trimEnd()}\n\n${prompt}` : prompt); requestAnimationFrame(() => draftRef.current?.focus()); }}/>
    <div className="catalogue-home-suggestion-draft">
      <label htmlFor="catalogue-home-draft">{t('示例草稿', 'Example draft')}</label>
      <Textarea ref={draftRef} id="catalogue-home-draft" value={draft} onChange={event => setDraft(event.target.value)} rows={2} autoResize maxRows={5} variant="soft" placeholder={t('点击上方建议，在这里继续编辑。', 'Choose a suggestion above, then edit it here.')}/>
    </div>
    <p className="ui-example-note">{t('以上均为虚构记录。收起偏好仅在本示例内生效；GitHub 图标链接到 SecondU 的公开仓库。', 'All records above are fictional. Dismissals apply only inside this example. The GitHub link opens SecondU’s public repository.')}</p>
    {notice && <p className="ui-result" role="status">{notice}</p>}
  </div>;
}
