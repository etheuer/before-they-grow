export type AgeBand = '3-5' | '6-8' | '9-12'
export type PromptCategory = 'wonder' | 'memory' | 'feelings' | 'family' | 'play'

export type Prompt = {
  id: string
  ageBand: AgeBand
  category: PromptCategory
  question: string
  followUp: string
}

const prompts: Record<AgeBand, Prompt[]> = {
  '3-5': [
    {
      id: '3-5-play-animal',
      ageBand: '3-5',
      category: 'play',
      question: 'If you could be any animal tomorrow, which one would you be?',
      followUp: 'What would we do together?',
    },
    {
      id: '3-5-memory-laugh',
      ageBand: '3-5',
      category: 'memory',
      question: 'What made you laugh the most today?',
      followUp: 'Can you show me how it happened?',
    },
    {
      id: '3-5-feelings-brave',
      ageBand: '3-5',
      category: 'feelings',
      question: 'When did you feel brave today?',
      followUp: 'What helped you feel brave?',
    },
    {
      id: '3-5-family-perfect-day',
      ageBand: '3-5',
      category: 'family',
      question: 'What would our perfect family day look like?',
      followUp: 'What should we do first?',
    },
    {
      id: '3-5-wonder-cloud',
      ageBand: '3-5',
      category: 'wonder',
      question: 'Where do you think clouds go at night?',
      followUp: 'What do they do while we sleep?',
    },
    {
      id: '3-5-play-holiday',
      ageBand: '3-5',
      category: 'play',
      question: 'If you invented a holiday, what would we celebrate?',
      followUp: 'What special food would we eat?',
    },
    {
      id: '3-5-memory-kind',
      ageBand: '3-5',
      category: 'memory',
      question: 'Who was kind to you today?',
      followUp: 'How did their kindness make you feel?',
    },
  ],
  '6-8': [
    {
      id: '6-8-memory-proud',
      ageBand: '6-8',
      category: 'memory',
      question: 'What happened today that made you feel proud?',
      followUp: 'What did you do to make it happen?',
    },
    {
      id: '6-8-wonder-invention',
      ageBand: '6-8',
      category: 'wonder',
      question: 'What would you invent to make mornings easier?',
      followUp: 'How would your invention work?',
    },
    {
      id: '6-8-feelings-weather',
      ageBand: '6-8',
      category: 'feelings',
      question: 'If your feelings were weather, what was today like?',
      followUp: 'What changed the weather?',
    },
    {
      id: '6-8-family-tradition',
      ageBand: '6-8',
      category: 'family',
      question: 'What family tradition should we keep forever?',
      followUp: 'What makes it special to you?',
    },
    {
      id: '6-8-play-secret-room',
      ageBand: '6-8',
      category: 'play',
      question: 'If our home had a secret room, what would be inside?',
      followUp: 'Who would you invite in first?',
    },
    {
      id: '6-8-memory-learned',
      ageBand: '6-8',
      category: 'memory',
      question: 'What is something new you figured out this week?',
      followUp: 'Who would you like to teach it to?',
    },
    {
      id: '6-8-feelings-listened',
      ageBand: '6-8',
      category: 'feelings',
      question: 'When did you feel really listened to today?',
      followUp: 'What did that person do well?',
    },
  ],
  '9-12': [
    {
      id: '9-12-feelings-misunderstood',
      ageBand: '9-12',
      category: 'feelings',
      question: 'What is something adults sometimes misunderstand about kids your age?',
      followUp: 'What do you wish they would ask instead?',
    },
    {
      id: '9-12-memory-change',
      ageBand: '9-12',
      category: 'memory',
      question: 'What changed your mind about something recently?',
      followUp: 'What helped you see it differently?',
    },
    {
      id: '9-12-family-advice',
      ageBand: '9-12',
      category: 'family',
      question: 'What advice from our family do you want to remember?',
      followUp: 'When do you think it will help you?',
    },
    {
      id: '9-12-wonder-future',
      ageBand: '9-12',
      category: 'wonder',
      question: 'What do you hope is different about the world in ten years?',
      followUp: 'What small part could you play?',
    },
    {
      id: '9-12-play-documentary',
      ageBand: '9-12',
      category: 'play',
      question: 'If someone made a documentary about your week, what would the title be?',
      followUp: 'Which scene would make the trailer?',
    },
    {
      id: '9-12-feelings-courage',
      ageBand: '9-12',
      category: 'feelings',
      question: 'What conversation took courage for you this week?',
      followUp: 'What would make the next one easier?',
    },
    {
      id: '9-12-memory-ordinary',
      ageBand: '9-12',
      category: 'memory',
      question: 'What ordinary moment from today would you like to keep?',
      followUp: 'What detail would help you remember it?',
    },
  ],
}

export function getPromptForDate(date: Date, ageBand: AgeBand): Prompt {
  const localDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayNumber = Math.floor(localDay.getTime() / 86_400_000)
  const choices = prompts[ageBand]
  return choices[Math.abs(dayNumber) % choices.length]
}

export function getAllPrompts(ageBand: AgeBand): Prompt[] {
  return [...prompts[ageBand]]
}
