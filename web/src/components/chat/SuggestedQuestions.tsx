'use client';

interface SuggestedQuestionsProps {
  questions: string[];
  onSelect: (question: string) => void;
}

const SuggestedQuestions = ({ questions, onSelect }: SuggestedQuestionsProps) => {
  if (!questions || questions.length === 0) return null;

  return (
    <div
      data-testid="suggested-questions"
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        padding: '8px 16px',
        background: 'var(--color-gray-100)',
      }}
    >
      {questions.map((q) => (
        <button
          key={q}
          onClick={() => onSelect(q)}
          style={{
            padding: '6px 12px',
            borderRadius: 16,
            border: '1px solid var(--color-gray-border)',
            background: 'var(--color-white)',
            fontFamily: 'var(--font-primary)',
            fontSize: 13,
            color: 'var(--color-gray-700)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {q}
        </button>
      ))}
    </div>
  );
};

export default SuggestedQuestions;
