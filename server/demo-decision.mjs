import { createHash } from 'node:crypto';
import { decisionExampleTaskId } from '../shared/demo-decision.mjs';
import { createSeed } from './seed.mjs';
import { createUSSeed } from './demo-us.mjs';

export const DECISION_EXAMPLE_MARKER = 'demo-decision-v1';
const stories = {
  zh: {
    title: '讨论下一阶段的职业方向',
    contextFactIds: ['fact-identity', 'fact-clear', 'fact-time', 'fact-small'],
    name: '职业方向讨论提纲.md',
    notice: '这段对话与提纲为万叶的虚构示例，预先编写，未调用模型；讨论中的意向未写入个人事实，也未执行求职或对外联系。',
    messages: [
      ['user', '最近做工作台内测，我发现自己最有兴趣的是把用户反馈变成能验证的问题。接下来两年，我应该继续做产品工程师，还是往产品研究的方向走？先陪我想清楚，不急着给职业标签。'],
      ['assistant', '可以先看你希望保留哪类工作。你有软件工程背景，也在参与工作台内测试用；把问题做成原型、再看真实使用结果，是现在已有的连接点。\n\n这支持“值得继续探索”，还不足以判断你更适合哪条职业路径。你更想减少纯交付，还是增加从访谈到验证的完整责任？'],
      ['user', '我想增加完整责任，还想保持动手能力。也不想靠晚上和假期再堆一份工作。现在没有决定离职，国庆回家和休息的安排照常。'],
      ['assistant', '那可以先在现岗位内比较两种工作方式：一条偏产品工程，自己把问题做到原型和验收；一条偏产品研究，更深入地做访谈、问题归纳和后续验证。\n\n你的工作日上午九点到十一点尽量不排会，节假日也不默认加班。试验应替换一部分现有工作，先确认负责人同意和可用时间。模型调用的项目预算不能当作你个人转职的经济缓冲。'],
      ['user', '如果只试四周，怎么知道自己是喜欢这个过程，还是只是喜欢这次题目？我也担心一直做小实验，最后没有积累。'],
      ['assistant', '四周可以先观察，不能据此给职业下定论。用一个已有的内测问题走完“访谈—原型—验证”，再向一位实际做产品研究的同事了解普通一周的工作。\n\n每周只记三件事：哪段工作愿意反复做；哪段工作消耗明显；最终留下了什么可复用材料。把第二周和第四周放在一起比较，区分短期新鲜感与持续兴趣。评估仍缺岗位空间、收入底线和转职成本，这些先留待确认。'],
      ['user', '好，先把这些留成讨论提纲。我倾向于从当前岗位试起，但这不是最终决定，也不要替我约人或投简历。'],
      ['assistant', '提纲已留在右侧，可以继续编辑。当前讨论方向是：保留动手能力，在现岗位内试一次更完整的研究与验证过程。\n\n- 先确认四周内能替换的工作范围与负责人支持。\n- 保留深度工作、回家和休息的时间。\n- 四周后再看兴趣、成果与代价，不把试验计划记成职业决定。\n\n这份会话和提纲是预先编写的示例，未调用模型；没有约人、投递或更新个人事实。'],
    ],
    content: `# 职业方向讨论提纲

> 万叶的虚构示例。以下为预先编写的讨论材料，未调用模型；不是已作出的职业决定，也没有发起对外行动。

## 这次想弄清楚什么

未来两年，希望怎样结合产品理解与动手实现？先比较工作内容，再考虑岗位名称。

## 已有背景与本次意向

- 既有示例资料：软件工程背景，目前做产品工程，参与工作台内测试用准备。
- 既有时间偏好：工作日上午九点到十一点尽量不排会；不默认安排节假日加班；给家人和休息留空。
- 本次对话的意向：增加从用户问题到验证的完整责任，同时保留动手能力。先在现岗位内探索，尚未决定离职。
- 本次意向只保留在对话与提纲中，未自动变成长期个人事实。

## 两条待比较的路径

| 路径 | 希望增加的工作 | 需要核实的现实条件 |
|---|---|---|
| 深化产品工程 | 自己把一个用户问题做成原型，并参与验证与验收 | 是否能承担完整问题、是否有足够的研究时间 |
| 向产品研究靠近 | 更深入地做访谈、问题归纳、验证设计与后续跟踪 | 普通一周的工作是否有吸引力、是否愿意减少部分实现工作 |

两条路径可以部分重叠。当前资料不足以判断哪一条更适合，也没有使用招聘、薪资或市场数据作结论。

## 四周探索草案

1. 第一周：与负责人确认一个已有内测问题、可替换的工作范围和验收方式。
2. 第二周：整理已获许可的用户反馈，形成一份问题说明和小原型。
3. 第三周：观察一次验证过程；另拟向研究同事了解日常工作的提问，联系前由本人确认。
4. 第四周：比较过程中的兴趣、消耗和可复用成果，决定继续、调整或停止。

这是一份待讨论的安排，尚未确认任何同事的时间，也未执行访谈或验证。

## 复盘时填写

- 我愿意反复做的是：＿＿＿＿
- 让我持续消耗的是：＿＿＿＿
- 我留下的可复用材料是：＿＿＿＿
- 这次题目的新鲜感，与长期兴趣的区别是：＿＿＿＿
- 下一个更小、可撤回的尝试是：＿＿＿＿

## 决定前仍缺什么

岗位空间、负责人支持、收入底线、个人储备和转职成本均待本人补充。项目的模型调用预算不能替代个人经济评估。保留国庆回家与休息安排，不用额外夜间和假期工时填满试验。
`,
  },
  en: {
    title: 'Discussing the next chapter of my career',
    contextFactIds: ['demo-us-fact-identity', 'demo-us-fact-short-notes', 'demo-us-fact-music', 'demo-us-fact-sends'],
    name: 'career-direction-discussion.md',
    notice: 'This conversation and outline are authored fictional examples for Caspian. No model was called, no career decision became a profile fact, and no outreach or application was sent.',
    messages: [
      ['user', 'The front-desk work has made me think about my next few years. I enjoy going into a recreation center, understanding the problem, and making something staff can use. Should I stay a hands-on designer or try to lead a broader service-design effort? Help me think before we pick a title.'],
      ['assistant', 'There is a useful thread in your existing background: studio design in Chicago, then work on recreation-center software at Cedar Loop. You now have a concrete setting in which to connect field observations with product decisions.\n\nThat gives us something to explore, not proof of a best career path. Do you want more responsibility for the whole problem, or less time doing detailed design?'],
      ['user', 'More responsibility, but I still want to make things. I am not planning to quit. I also do not want a second job in my evenings. Wednesday rehearsal and the repair café are part of the life I want to keep.'],
      ['assistant', 'Then an internal experiment seems worth discussing first. One path is deeper hands-on ownership, from field observation through a shipped change. Another is coordinating a service problem across staff, design and engineering, with less direct design time.\n\nNeither needs to start as a promotion or a job search. The experiment should replace some current work, with your manager’s agreement. Keep Wednesday 6:30–8:30 clear; the repair-café budget and family-travel budget do not tell us what career risk you can afford.'],
      ['user', 'What could I learn in a month? I am worried that I just like this particular project. I do not want to mistake a good week for a new direction.'],
      ['assistant', 'Use the month to gather observations, not settle the decision. Follow one existing front-desk problem from field notes through a small design and a staff review. Separately, ask a service-design lead what an ordinary week involves; draft the questions before contacting anyone.\n\nEach week, note what you would willingly repeat, what drained you, and what you produced that others could reuse. Compare weeks two and four. We would still need to discuss role scope, income needs and the practical cost of a transition before considering a larger move.'],
      ['user', 'Save that as a discussion outline. I lean toward trying it inside my current role, but that is not a final decision. Do not arrange any conversations or send an application for me.'],
      ['assistant', 'The outline is available on the right for editing. The working direction is to keep making things while trying broader responsibility within your current role.\n\n- Confirm a four-week scope that replaces existing work.\n- Keep rehearsal, volunteering and rest in the plan.\n- Review interest, useful output and costs before choosing another step.\n\nThis is an authored example, not a model run. No outreach, application or profile-fact update has taken place.'],
    ],
    content: `# Career direction: a discussion outline

> An authored fictional example for Caspian. No model was called. This is a discussion document, not a settled career decision or completed outreach.

## The question

Over the next few years, how much hands-on design and broader service responsibility would I like in my work? Compare the work before choosing a title.

## Existing background and this conversation

- Existing example records: studied design in Minneapolis, worked at a Chicago studio, and now designs recreation-center software at fictional Cedar Loop in Portland.
- Existing commitments: Wednesday rehearsal, 6:30–8:30 p.m.; volunteering at the neighborhood repair café; time for family and rest.
- Stated in this conversation: more ownership of the whole problem, while continuing to make things. Explore within the current role before considering a move.
- The new intention remains in this conversation and document. It has not been added as a lasting profile fact.

## Two paths to compare

| Path | Work to explore | Practical questions |
|---|---|---|
| Deeper hands-on product design | Own a problem from field observation through a small design and staff review | Can the role include that scope and enough time with staff? |
| Broader service-design responsibility | Coordinate the staff, design and engineering parts of one service problem | Is the ordinary week appealing, including less direct design time? |

These paths can overlap. The available example records do not establish which is best, and no hiring, salary or market claim has been used to rank them.

## A four-week experiment to discuss

1. Week one: agree on one existing front-desk problem, the work it replaces and a useful outcome with the manager.
2. Week two: turn permitted field notes into a problem statement and a small design.
3. Week three: observe a staff review. Draft questions about a service-design lead’s ordinary week; review the contact details before sending anything.
4. Week four: compare interest, energy and reusable work. Choose whether to continue, adjust or stop.

This schedule is a proposal. No colleague’s time has been confirmed, and no visit or interview has been arranged.

## Notes for the review

- Work I would willingly repeat: ______
- Work that consistently drained me: ______
- Something useful others could reuse: ______
- Evidence beyond the novelty of this particular project: ______
- A smaller, reversible next step: ______

## Still unknown

Role scope, manager support, income needs, savings and transition costs need Caspian’s input. The repair-café and family-travel budgets are not a career-risk budget. The experiment must fit alongside rehearsal, volunteering and rest instead of becoming an extra evening job.
`,
  },
};

/** One canonical authored task per independent locale, never a simulated run. */
export function createDecisionExample(language) {
  const story = stories[language];
  if (!story) throw new Error('Unknown decision-example locale.');
  const taskId = decisionExampleTaskId(language), artifactId = `demo-decision-artifact-${language}`;
  const at = minute => new Date(Date.UTC(2026, 8, 30, 7, minute)).toISOString();
  const messages = story.messages.map(([role, content], i) => ({ id: `${taskId}-m${i}`, role, content, createdAt: at(i + 1) }));
  const updatedAt = at(messages.length + 1);
  return {
    task: { id: taskId, title: story.title, prompt: messages[0].content, agentIds: [], contextFactIds: story.contextFactIds,
      digitalTwinEnabled: true, connectorIds: [], mode: 'demo', status: 'completed', interaction: 'task', createdAt: at(0), updatedAt,
      messages, events: [{ id: `${taskId}-record`, type: 'showcase.recorded', label: language === 'zh' ? '预先编写的示例' : 'Authored example', detail: story.notice, createdAt: updatedAt }], artifactIds: [artifactId], approvals: [] },
    artifact: { id: artifactId, taskId, name: story.name, type: 'markdown', classification: 'artifact', origin: { kind: 'demo' },
      reviewStatus: 'ready', content: story.content, version: 1, versions: [{ version: 1, content: story.content, createdAt: updatedAt, author: 'SecondU' }], updatedAt },
  };
}

/** Add once on canonical-space startup; edited, deleted or colliding records stay intact. */
export function ensureDecisionExample(store) {
  const profile = store.meta('profile');
  if (!profile.demo || store.get('meta', DECISION_EXAMPLE_MARKER)) return;
  const language = profile.demoLocale === 'en' ? 'en' : 'zh';
  const bundle = createDecisionExample(language);
  const baseline = language === 'en' ? createUSSeed() : createSeed();
  return store.transaction(() => {
    if (store.get('meta', DECISION_EXAMPLE_MARKER)) return;
    const records = [['tasks', bundle.task], ['artifacts', bundle.artifact]];
    const collisions = records.filter(([collection, record]) => store.get(collection, record.id)).map(([collection, record]) => `${collection}/${record.id}`);
    const missingFacts = bundle.task.contextFactIds.filter(id => !store.get('facts', id));
    const changedFacts = bundle.task.contextFactIds.filter(id => {
      const current = store.get('facts', id), expected = baseline.facts.find(fact => fact.id === id);
      return current && (!expected || current.statement !== expected.statement || current.status !== expected.status);
    });
    const profileChanged = profile.name !== baseline.profile.name;
    const report = { installedAt: new Date().toISOString(), language, installed: [], preserved: collisions, missingFacts, changedFacts, profileChanged };
    if (!collisions.length && !missingFacts.length && !changedFacts.length && !profileChanged) {
      for (const [collection, record] of records) {
        store.put(collection, record);
        report.installed.push({ collection, id: record.id, sha256: createHash('sha256').update(JSON.stringify(record)).digest('hex') });
      }
    }
    store.setMeta(DECISION_EXAMPLE_MARKER, report);
    return report;
  });
}
