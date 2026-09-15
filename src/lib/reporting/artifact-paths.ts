export function reportArtifactPathnames(workspaceId: string, reportId: string) {
  const base = `reports/${workspaceId}/${reportId}`;
  return {
    pdfPathname: `${base}/parenting-log.pdf`,
    zipPathname: `${base}/evidence-package.zip`,
  };
}
