import { FileUploadCard, type FileUploadCardProps } from "./file-upload-card";

export function ExcelUploadCard(props: Omit<FileUploadCardProps, "kind">) {
  return <FileUploadCard {...props} kind="excel" />;
}
