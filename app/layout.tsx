import type { Metadata } from 'next'
import './globals.css'
import { GatewayProvider } from '@/context/gateway-context'
import { RepoProvider } from '@/context/repo-context'
import { EditorProvider } from '@/context/editor-context'

export const metadata: Metadata = {
  title: 'Code Editor',
  description: 'Gateway-integrated code editor with AI coding agent',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="obsidian" className="dark">
      <body className="bg-[var(--bg)] text-[var(--text-primary)] antialiased">
        <GatewayProvider>
          <RepoProvider>
            <EditorProvider>
              {children}
            </EditorProvider>
          </RepoProvider>
        </GatewayProvider>
      </body>
    </html>
  )
}
