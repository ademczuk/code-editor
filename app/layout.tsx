import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/context/theme-context'
import { GatewayProvider } from '@/context/gateway-context'
import { RepoProvider } from '@/context/repo-context'
import { EditorProvider } from '@/context/editor-context'
import { LocalProvider } from '@/context/local-context'
import { ViewProvider } from '@/context/view-context'
import { GitHubAuthProvider } from '@/context/github-auth-context'
import { PluginProvider } from '@/context/plugin-context'
import { PreviewProvider } from '@/context/preview-context'
import { WorkflowProvider } from '@/context/workflow-context'

export const metadata: Metadata = {
  title: 'Knot Code',
  description: 'Gateway-integrated code editor with AI coding agent',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="obsidian" className="dark" suppressHydrationWarning>
      <body className="antialiased">
          <ThemeProvider>
            <GatewayProvider>
              <GitHubAuthProvider>
                <RepoProvider>
                  <EditorProvider>
                    <LocalProvider>
                      <ViewProvider>
                        <WorkflowProvider>
                        <PreviewProvider>
                        <PluginProvider>
                          {children}
                        </PluginProvider>
                        </PreviewProvider>
                        </WorkflowProvider>
                      </ViewProvider>
                    </LocalProvider>
                  </EditorProvider>
                </RepoProvider>
              </GitHubAuthProvider>
            </GatewayProvider>
          </ThemeProvider>
      </body>
    </html>
  )
}
