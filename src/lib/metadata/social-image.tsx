import { ImageResponse } from "next/og";

export const socialImageAlt =
  "Family Daybook — a calmer way to keep family days clear";

export const socialImageSize = {
  width: 1200,
  height: 630,
};

export const socialImageContentType = "image/png";

function DaybookMark() {
  return (
    <svg
      aria-label="Family Daybook open book mark"
      height="118"
      viewBox="0 0 172 180"
      width="112"
    >
      <path
        d="M17.1 31.5h27.4c21 0 37.6 14 37.6 31.7v86c-14.5-10.8-35.4-15.6-64.4-15.6-6 0-9.7-3.8-9.7-9.7V41.2c0-5.9 3.8-9.7 9.1-9.7Z"
        fill="#b7cddd"
      />
      <path
        d="M86.4 63.2c0-17.7 16.7-31.7 37.6-31.7h26.9c5.9 0 9.1 3.8 9.1 9.7v82.7c0 5.9-3.8 9.7-9.1 9.7-29 0-50 4.8-64.5 15.6v-86Z"
        fill="#45657e"
      />
      <circle cx="140.1" cy="53" fill="#d0e1ec" r="7.8" />
      <path
        d="M84.3 95.5c-4.9-7.6-10.2-10.8-15.6-10.8-8.1 0-14.5 5.9-14.5 14 0 10.2 7.5 17.7 14.5 24.7l15.6 15 15-15c7.5-7 14.5-14.5 14.5-24.7 0-8.1-6.4-14-14.5-14-5.4 0-10.2 3.2-15 10.8Z"
        fill="#f9fbfc"
      />
    </svg>
  );
}

export function createSocialImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#f9fbfc",
        color: "#45657e",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        overflow: "hidden",
        padding: "54px",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          background: "#e9f0f5",
          borderRadius: "999px",
          display: "flex",
          height: "420px",
          left: "-130px",
          position: "absolute",
          top: "-220px",
          width: "420px",
        }}
      />
      <div
        style={{
          background: "#f0f5f8",
          borderRadius: "999px",
          bottom: "-180px",
          display: "flex",
          height: "390px",
          position: "absolute",
          right: "-100px",
          width: "390px",
        }}
      />
      <div
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0, transparent 47px, #e1eaf0 48px)",
          display: "flex",
          height: "100%",
          left: 0,
          opacity: 0.8,
          position: "absolute",
          top: 0,
          width: "100%",
        }}
      />
      <div
        style={{
          alignItems: "stretch",
          background: "rgba(255, 255, 255, 0.92)",
          border: "1px solid #d5dfe6",
          borderRadius: "34px",
          boxShadow: "0 24px 70px rgba(39, 61, 78, 0.12)",
          display: "flex",
          height: "100%",
          overflow: "hidden",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#eaf2f7",
            display: "flex",
            justifyContent: "center",
            width: "34%",
          }}
        >
          <div
            style={{
              alignItems: "center",
              background: "#ffffff",
              border: "1px solid #d5dfe6",
              borderRadius: "32px",
              boxShadow: "0 16px 36px rgba(39, 61, 78, 0.1)",
              display: "flex",
              height: "210px",
              justifyContent: "center",
              width: "210px",
            }}
          >
            <DaybookMark />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            padding: "54px 62px",
          }}
        >
          <div
            style={{
              color: "#5c6872",
              display: "flex",
              fontSize: "20px",
              fontWeight: 700,
              letterSpacing: "0.16em",
              marginBottom: "22px",
              textTransform: "uppercase",
            }}
          >
            Private family daybook
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "serif",
              fontSize: "70px",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            Family Daybook
          </div>
          <div
            style={{
              color: "#5c6872",
              display: "flex",
              fontSize: "29px",
              lineHeight: 1.35,
              marginTop: "26px",
              maxWidth: "610px",
            }}
          >
            A calmer place for the details that matter.
          </div>
          <div
            style={{
              alignItems: "center",
              color: "#5c6872",
              display: "flex",
              fontSize: "19px",
              marginTop: "36px",
            }}
          >
            <div
              style={{
                background: "#85a9c2",
                borderRadius: "999px",
                display: "flex",
                height: "9px",
                marginRight: "13px",
                width: "9px",
              }}
            />
            Caregiving · Appointments · Notes · Timeline
          </div>
        </div>
      </div>
    </div>,
    socialImageSize,
  );
}
