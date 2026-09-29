import { useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox';
import { Switch } from '@openai/apps-sdk-ui/components/Switch';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Markdown } from '@openai/apps-sdk-ui/components/Markdown';
import { LoadingIndicator, LoadingDots } from '@openai/apps-sdk-ui/components/Indicator';
import { Search, Check, Plus, ArrowUp, Document, Agent, Clock, User, Settings } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, Empty, PageHeading, TaskBadge } from './components';

export function ComponentCatalogue() {
  const [text,setText]=useState(''); const [checked,setChecked]=useState(true); const [enabled,setEnabled]=useState(false); const [choice,setChoice]=useState('balanced'); const [tab,setTab]=useState('preview'); const [dialog,setDialog]=useState(false); const [approved,setApproved]=useState(false);
  return <div className="page-content catalogue"><PageHeading title="组件目录" description="这套应用正在使用的基础控件、状态和组合。所有示例都可操作。" /><p className="catalogue-note">基于官方 Apps SDK UI。此页用于查看与验证组件，操作只改变本页示例。</p><div className="catalogue-grid">
    <section><h2>操作</h2><p>Button · 相同的尺寸、焦点和加载状态</p><div className="component-samples"><Button color="primary" onClick={()=>setDialog(true)}><Plus />主要操作</Button><Button color="secondary" variant="outline" onClick={()=>setDialog(true)}>次要操作</Button><Button color="secondary" variant="ghost" onClick={()=>setDialog(true)}>轻量操作</Button><Button color="primary" disabled>不可用</Button><Button color="primary" loading>处理中</Button><Button color="primary" uniform aria-label="示例发送" onClick={()=>setDialog(true)}><ArrowUp /></Button></div></section>
    <section><h2>输入</h2><p>Input / Textarea · 显式标签与自然的反馈</p><Input aria-label="组件搜索示例" startAdornment={<Search />} placeholder="试着输入一些内容" value={text} onChange={event=>setText(event.target.value)} /><Textarea aria-label="组件文本区域示例" rows={2} placeholder="较长的内容可以在这里输入" /><small className="secondary">{text ? `已输入 ${text.length} 个字` : '输入内容不会保存'}</small></section>
    <section><h2>选择</h2><p>Select / SegmentedControl</p><Select value={choice} onChange={option=>setChoice(option.value)} options={[{value:'brief',label:'简短'},{value:'balanced',label:'均衡'},{value:'deep',label:'深入'}]} /><SegmentedControl value={tab} onChange={setTab} aria-label="组件视图选择"><SegmentedControl.Option value="preview">预览</SegmentedControl.Option><SegmentedControl.Option value="edit">编辑</SegmentedControl.Option><SegmentedControl.Option value="history">版本</SegmentedControl.Option></SegmentedControl></section>
    <section><h2>确认与开关</h2><p>Checkbox / Switch</p><Checkbox label="这条认识符合我的情况" checked={checked} onCheckedChange={setChecked} /><Switch label={enabled ? '自动化已启用' : '自动化已暂停'} checked={enabled} onCheckedChange={setEnabled} /><div className="component-samples"><Badge>已确认</Badge><Badge variant="outline">推断</Badge><Badge color="warning">待确认</Badge></div></section>
    <section><h2>任务状态</h2><p>共享业务组件 · 标签来自真实状态</p><div className="component-samples"><TaskBadge status="queued" /><TaskBadge status="running" /><TaskBadge status="awaiting_approval" /><TaskBadge status="completed" /><TaskBadge status="failed" /><TaskBadge status="cancelled" /></div><div className="component-samples"><LoadingIndicator /><span>加载中</span><LoadingDots /></div></section>
    <section><h2>消息与错误</h2><p>Alert · 在发生问题的地方说明原因</p><Alert color="primary" variant="soft" title="已保存到当前电脑" description="你可以稍后回来继续编辑。" /><Alert color="danger" variant="soft" title="连接没有成功" description="检查服务地址后，再试一次。此处为组件示例。" /></section>
    <section className="catalogue-wide"><h2>一次具体的确认</h2><p>审批组合 · 操作、范围、结果保持在一起</p><div className="approval-card"><div className="row spread"><h3>保存这份计划</h3>{approved && <Badge>示例已确认</Badge>}</div><p>将内容写成当前任务中的一个本地文档。这个目录示例不会创建实际文件。</p><div className="approval-actions"><Button color="secondary" variant="outline" onClick={()=>setApproved(false)}>重置示例</Button><Button color="primary" onClick={()=>setApproved(true)} disabled={approved}><Check />允许这一次</Button></div></div></section>
    <section><h2>文字排版</h2><p>Markdown · 文档、对话与成果共享</p><Markdown>{'### 留下可以继续的结果\n一段清楚的说明，连接**判断**、依据和下一步。\n\n- 保留原始来源\n- 标注未确认的判断\n- 接受新的纠正\n\n`revision: 2`'}</Markdown></section>
    <section><h2>没有内容时</h2><p>EmptyMessage</p><Empty title="还没有成果" description="从一件具体的小事开始，完成后的文档会出现在这里。" action={<Button color="secondary" variant="outline" onClick={()=>setDialog(true)}>试一个任务</Button>} /></section>
    <section><h2>表面与层级</h2><p>官方语义 tokens · 跟随浅色 / 深色</p><div className="token-samples">{['surface','surface-secondary','surface-tertiary'].map(token=><div key={token}><span style={{background:`var(--color-${token})`}} /><code>{token}</code></div>)}</div><div className="type-samples"><strong>主要内容</strong><span className="secondary">补充说明</span><small>来源与时间</small></div></section>
    <section><h2>图标</h2><p>官方 Icon · 保持一致的线条与尺寸</p><div className="icon-samples"><Search /><Plus /><ArrowUp /><Document /><Agent /><Clock /><User /><Settings /></div></section>
  </div>{dialog && <Dialog title="对话框示例" onClose={()=>setDialog(false)}><p>键盘焦点留在对话框中。按 Escape 或关闭按钮返回，原页面状态保留。</p><div className="dialog-actions"><Button color="primary" onClick={()=>setDialog(false)}>知道了</Button></div></Dialog>}</div>;
}
