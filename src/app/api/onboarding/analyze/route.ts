import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai'

export async function POST(req: NextRequest) {
  try {
    const { portfolioUrl } = await req.json()

    if (!portfolioUrl) {
      return NextResponse.json(
        { error: 'portfolioUrl is required' },
        { status: 400 },
      )
    }

    // Fetch portfolio HTML
    let portfolioContent = ''
    try {
      const res = await fetch(portfolioUrl, {
        headers: { 'User-Agent': 'PhotoPal/1.0' },
        signal: AbortSignal.timeout(10_000),
      })
      portfolioContent = await res.text()
      // Trim to avoid token limits
      portfolioContent = portfolioContent.replace(/<[^>]+>/g, ' ').slice(0, 8000)
    } catch {
      portfolioContent = `Portfolio URL: ${portfolioUrl}`
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an assistant that extracts photographer profile information from portfolio websites.
Return a JSON object with these fields:
- name: string (photographer's name, or empty string)
- bio: string (2-3 sentence professional bio)
- location: string (city and country if found)
- style: string (photography style, e.g. "Natural light, editorial, moody")
- specialties: string[] (list of photography niches e.g. ["weddings", "portraits", "commercial"])
- equipment: string[] (camera/lens brands if mentioned)
- priceRange: string (price range if mentioned, else empty string)
- yearsExperience: number (estimated years, default 0)`,
        },
        {
          role: 'user',
          content: `Analyse this photographer portfolio content and extract profile information:\n\n${portfolioContent}`,
        },
      ],
    })

    const raw = completion.choices[0].message.content ?? '{}'
    const profile = JSON.parse(raw)

    return NextResponse.json(profile)
  } catch (err) {
    console.error('[analyze]', err)
    return NextResponse.json(
      { error: 'Failed to analyse portfolio' },
      { status: 500 },
    )
  }
}
