import type { FC } from 'react'

const URL_SPLIT_REGEX = /(https?:\/\/[^\s]+)/g
const URL_TEST_REGEX = /^https?:\/\//

interface LinkifiedTextProps {
  text: string
}

const LinkifiedText: FC<LinkifiedTextProps> = ({ text }) => {
  const parts = text.split(URL_SPLIT_REGEX)
  return (
    <>
      {parts.map((part, i) =>
        URL_TEST_REGEX.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  )
}

export default LinkifiedText
