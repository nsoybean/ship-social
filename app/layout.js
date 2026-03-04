import "./globals.css";

export const metadata = {
  title: "Ship -> Social",
  description: "Connect GitHub, pick repos, and automate release-to-social workflows"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
