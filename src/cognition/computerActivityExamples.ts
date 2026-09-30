import { t } from '../i18n';

export type AppName = 'Chrome' | 'VS Code' | 'Figma' | 'Notion' | 'SecondU';
export type Evidence = { app: AppName; at: string; title: string; text: string };
export type Activity = { id: string; date: string; time: string; title: string; summary: string; evidence: Evidence[] };

/** Authored examples of two fictional lives; no computer activity was captured. */
export function computerActivityExamples(): Activity[] {
  return [
    {
      id: 'release-decision', date: '2026-09-30', time: '10:20',
      title: t('整理工作台试用反馈', 'Reviewing the family check-in findings'),
      summary: t('查看了 48 条试用反馈，并对照下午的版本评审准备修改清单。保存后内容丢失的两例需要优先排查，其余问题保留原记录，按影响和现有证据分别讨论。', 'Read Priya’s notes from 7 family check-ins and compared the two proposed flows. In 4 visits, staff wrote names on paper. The review focuses on keeping those names visible; the notes do not establish that the change will shorten the queue.'),
      evidence: [
        { app: 'Notion', at: '10:22', title: t('工作台试用反馈记录', 'Lakeside front-desk notes'), text: t('反馈按任务继续、文件编辑、来源查看和首次使用分为 19、13、9、7 条。其中有两例提到保存后重新打开，修改内容丢失。记录条数还没有按参与者去重。', 'Priya observed 7 family check-ins. Staff wrote names on paper in 4 of them. The screen showed one child at a time, while staff also had to manage the queue and avoid asking parents to repeat names.') },
        { app: 'SecondU', at: '10:28', title: t('9 月 30 日评审准备', 'Family check-in review notes'), text: t('评审清单分别列出问题、对应记录、负责人和复查步骤。徐静的报价单用于复现保存问题；文件列表用三份同名会议记录检查。没有把建议中的修改标记为已完成。', 'The notes compare a family list that stays visible with an add-another flow using the same scenario. They include the back-button behavior and distinguish this visit’s list from a saved family profile.') },
      ],
    },
    {
      id: 'prototype-review', date: '2026-09-30', time: '09:10',
      title: t('检查任务中断后的界面说明', 'Checking names and errors in the prototype'),
      summary: t('在设计稿和浏览器中查看任务中断后的状态，核对已有文件是否保留，以及页面是否说明接下来需要用户做什么。等待补充、等待确认和已中断分开处理。', 'Compared the prototype with Emily’s comments about the payment panel. The selected child’s name needs to stay visible, and errors should identify the child. A clickable review is still needed to check keyboard focus.'),
      evidence: [
        { app: 'Figma', at: '09:12', title: t('工作台中断与恢复流程', 'Family pass and payment screens'), text: t('设计稿列出等待用户补充、等待操作确认和执行中断三种状态，每种状态有一个主要操作。说明需要写清已有成果和继续任务所需的条件。', 'The design keeps the selected child’s name above the total. The error example reads “Choose a pass for Jamie,” so staff can see which entry needs attention.') },
        { app: 'Chrome', at: '09:18', title: t('工作台交互原型', 'Clickable check-in prototype'), text: t('继续原任务时，工作区里的文件应当保留。已经失效的操作确认需要重新核对，页面应说明这次需要确认的内容。', 'Emily asked for the clickable version because screenshots cannot show where keyboard focus lands. The review also needs to cover going back after three children have been added without losing their names.') },
      ],
    },
    {
      id: 'demo-script', date: '2026-09-29', time: '16:30',
      title: t('修改版本评审的演示顺序', 'Preparing the photo zine for a rough print'),
      summary: t('调整了三分钟演示稿，从一条具体反馈开始，接着说明修改建议、用户的纠正和最终保存的文档。结尾保留打开成果并检查内容的步骤。', 'Reviewed the 12-photo selection with Grace and Maya’s comments beside it. The bus-window photo opens the sequence and the empty basketball court closes it. The next step is a rough print, before spending more time on color edits.'),
      evidence: [
        { app: 'Notion', at: '16:32', title: t('三分钟版本演示稿', 'Photo selection and sequence'), text: t('开头先交代评审还有两天、需要决定优先修改哪些问题。删去开场的技术名词，把时间留给反馈依据和具体取舍。', 'Grace suggested swapping the two middle street corners. Maya asked to keep the blurry bakery window. Those comments are recorded beside the selected files, rather than treated as a new visual inspection of the photos.') },
        { app: 'SecondU', at: '16:38', title: t('演示结尾的检查步骤', 'Rough-print preparation'), text: t('最后打开修改后的评审清单，检查保存并重新打开后内容是否一致。用这一步展示成果如何继续使用，结束时不再另加品牌口号。', 'The plan is to print 10 inexpensive copies during Friday’s lunch break using the existing equipment. The layout still needs to be checked on paper; no print order has been placed in this example.') },
      ],
    },
    {
      id: 'family-plan', date: '2026-09-29', time: '18:40',
      title: t('调整回杭州后的周末安排', 'Comparing plans for Dad’s birthday weekend'),
      summary: t('对照家人群和已经约好的见面时间，重新整理回杭州的安排。保留和王磊、刘老师的约定，10 月 4 日晚上在家做饭；父母不想去西湖，就不再加这段行程。', 'Compared the November travel options with Emma and Ben’s driving times. Arriving in Chicago on Thursday would allow dinner with Noah and a stay on their couch. The return flight still needs to leave enough time after Sunday’s drive from Madison.'),
      evidence: [
        { app: 'Notion', at: '18:42', title: t('国庆回杭州的安排', 'November 13–15 family plans'), text: t('10 月 3 日 15:00 暂约王磊在紫金港附近吃面，4 日 14:00 暂约刘老师喝茶，4 日晚上和爸妈、妹妹在家吃饭。车票和两次见面的店名都还没确定。', 'Emma and Ben leave Chicago after school on Friday and need to be home by Sunday evening. Saturday is for a family meal and a possible lake walk. Sunday lunch remains optional so they can leave around 2 p.m.') },
        { app: 'SecondU', at: '18:48', title: t('行程调整说明', 'Travel costs and open decisions'), text: t('爸爸不喜欢赶路，妈妈希望一起吃家常饭。因此每天最多保留一个外出选项，目前没有预订或付款。', 'The Chicago option totals $592 from the supplied estimates, within the roughly $600 travel budget. The cheaper early return conflicts with the Sunday drive. Flight times and prices are planning examples, and nothing has been booked.') },
      ],
    },
  ];
}
