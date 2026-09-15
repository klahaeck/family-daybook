import { attachmentContentType } from "./attachment-picker";

describe("attachmentContentType", () => {
  it("uses supported picker MIME types", () => {
    expect(attachmentContentType("scan.bin", "application/pdf")).toBe("application/pdf");
    expect(attachmentContentType("photo.jpg", "image/jpg")).toBe("image/jpeg");
  });

  it("falls back to the filename when the picker omits a MIME type", () => {
    expect(attachmentContentType("school-note.HEIC")).toBe("image/heic");
    expect(attachmentContentType("clip.mov")).toBe("video/quicktime");
  });

  it("rejects unsupported files", () => {
    expect(attachmentContentType("notes.txt", "text/plain")).toBeUndefined();
  });
});
