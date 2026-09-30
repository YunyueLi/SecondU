import { lazy, Suspense, useEffect, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Document } from '@openai/apps-sdk-ui/components/Icon';
import { APIError, getArrayBuffer, messageOf } from '../api';
import { t } from '../i18n';

const PdfPreview = lazy(() => import('./PdfPreview'));

function conversionError(error: unknown) {
  if (!(error instanceof APIError)) return messageOf(error);
  const messages: Record<string, [string, string]> = {
    office_preview_unavailable: ['这台电脑尚未安装 LibreOffice，暂时无法生成预览。原文件仍可下载。', 'LibreOffice is not installed on this computer, so a preview is unavailable. You can still download the original.'],
    office_preview_timeout: ['本机转换超时。可以重试，或下载原文件。', 'Local conversion timed out. Retry or download the original.'],
    office_preview_busy: ['本机正在转换其他文件，请稍后重试。原文件仍可下载。', 'This computer is converting other files. Retry shortly; the original is still available to download.'],
    office_preview_failed: ['这份文件未能转换为预览。可以重试，或下载原文件。', 'This file could not be converted for preview. Retry or download the original.'],
    office_unsafe_content: ['这份文件包含本机预览不支持的内容。请下载原件，在本机应用中检查。', 'This file contains content that local preview does not support. Download the original and inspect it in a local app.'],
    office_archive_limit: ['这份文件展开后的内容超过本机预览上限。请下载原文件。', 'The expanded file exceeds the local preview limit. Download the original file.'],
    invalid_artifact_content: ['这份 Office 文件不完整或格式不正确。请检查原文件。', 'This Office file is incomplete or invalid. Check the original file.'],
  };
  if (error.status === 404) return t('这个文件版本已不可用，请切换版本或下载当前原文件。', 'This file version is unavailable. Choose another version or download the current original.');
  return error.code && messages[error.code] ? t(...messages[error.code]) : messageOf(error);
}

export function OfficePreview({ id, version, name, available }: { id?: string; version?: number; name: string; available: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const request = id && Number.isSafeInteger(version) && Number(version) > 0 && available ? `/artifacts/${encodeURIComponent(id)}/preview?version=${version}` : '';
  const [result, setResult] = useState<{ request: string; attempt: number; bytes?: Uint8Array<ArrayBuffer>; error?: string }>();
  const current = result?.request === request && result.attempt === attempt ? result : undefined;
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    void getArrayBuffer(request, 'application/pdf', controller.signal).then(buffer => {
      if (controller.signal.aborted) return;
      const bytes = new Uint8Array(buffer);
      if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new APIError(t('本机转换没有返回有效的 PDF。请重试或下载原文件。', 'Local conversion did not return a valid PDF. Retry or download the original.'), 422, 'preview_format_invalid');
      setResult({ request, attempt, bytes });
    }).catch(error => { if (!controller.signal.aborted) setResult({ request, attempt, error: conversionError(error) }); });
    return () => controller.abort();
  }, [request, attempt]);
  if (!available) return <div className="artifact-unavailable"><Document /><strong>{t('缺少完整的 Office 文件', 'Complete Office file unavailable')}</strong><p>{t('当前记录没有与文件类型匹配的原始数据，无法转换预览。', 'This record does not contain the original data for this file type, so a preview cannot be converted.')}</p></div>;
  if (!request) return <div className="artifact-unavailable"><Document /><strong>{t('尚未生成本机预览', 'Local preview unavailable')}</strong><p>{t('这份文件尚未保存为可转换的本机版本。可以下载原文件。', 'This file has no saved local version to convert. You can download the original.')}</p></div>;
  if (current?.error) return <div className="artifact-unavailable" role="alert"><Document /><strong>{t('Office 预览暂不可用', 'Office preview unavailable')}</strong><p>{current.error}</p><Button color="secondary" variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>{t('重试预览', 'Retry preview')}</Button></div>;
  if (!current?.bytes) return <p className="artifact-preview-notice" role="status">{t('正在本机转换 Office 预览…', 'Converting the Office preview on this computer…')}</p>;
  return <><Suspense fallback={<p className="artifact-preview-notice" role="status">{t('正在载入 PDF 阅读器…', 'Loading PDF reader…')}</p>}><PdfPreview bytes={current.bytes} name={name} /></Suspense><p className="artifact-preview-caption">{t('由本机转换为只读预览，下载时保留原始 Office 文件。', 'Converted on this computer for read-only preview. Downloads preserve the original Office file.')}</p></>;
}
