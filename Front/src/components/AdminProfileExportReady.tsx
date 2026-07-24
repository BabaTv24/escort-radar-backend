import React from 'react';
import type { PreparedAdminProfileExport } from '../lib/adminProfileExportFlow';
import { formatAdminProfileExportSize } from '../lib/adminProfileExportFlow';

type Props = {
  file: PreparedAdminProfileExport;
  canSaveAs: boolean;
  labels: {
    ready: string;
    profileCount: string;
    filename: string;
    fileSize: string;
    download: string;
    saveAs: string;
    close: string;
  };
  statusMessage: string;
  onDownload: () => void;
  onSaveAs: () => void;
  onClose: () => void;
};

export function AdminProfileExportReady({
  file,
  canSaveAs,
  labels,
  statusMessage,
  onDownload,
  onSaveAs,
  onClose
}: Props) {
  return (
    <>
      <h3>{labels.ready}</h3>
      <dl>
        <dt>{labels.profileCount}</dt><dd>{file.profileCount}</dd>
        <dt>{labels.filename}</dt><dd>{file.filename}</dd>
        <dt>{labels.fileSize}</dt><dd>{formatAdminProfileExportSize(file.blob.size)}</dd>
      </dl>
      {statusMessage ? <p role="status">{statusMessage}</p> : null}
      <div className="admin-actions-row">
        <a className="button primary" href={file.objectUrl} download={file.filename} onClick={onDownload}>{labels.download}</a>
        {canSaveAs ? <button type="button" className="button" onClick={onSaveAs}>{labels.saveAs}</button> : null}
        <button type="button" className="button" onClick={onClose}>{labels.close}</button>
      </div>
    </>
  );
}
