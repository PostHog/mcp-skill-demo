import './globals.css';

export const metadata = {
  title: 'MCP Pixel Grid',
  description: 'MCP as one interface among many.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
