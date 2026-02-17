/**
 * Skip to Main Content Link
 *
 * Provides keyboard users and screen reader users a way to skip
 * repetitive navigation and jump directly to main content.
 */

interface SkipToContentProps {
  mainContentId?: string
  label?: string
}

export default function SkipToContent({
  mainContentId = 'main-content',
  label = 'Skip to main content'
}: SkipToContentProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    const mainContent = document.getElementById(mainContentId)
    if (mainContent) {
      mainContent.focus()
      mainContent.scrollIntoView()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const mainContent = document.getElementById(mainContentId)
      if (mainContent) {
        mainContent.focus()
        mainContent.scrollIntoView()
      }
    }
  }

  return (
    <a
      href={`#${mainContentId}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="skip-to-content"
    >
      {label}
    </a>
  )
}
