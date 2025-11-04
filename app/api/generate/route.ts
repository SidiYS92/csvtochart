import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { columns, data, columnTypes, columnStats, objective } = body;

    // Prepare comprehensive data context for Gemini
    const dataContext = {
      totalRows: data.length,
      columns: columns.map((col: string, index: number) => ({
        name: col,
        type: columnTypes[col],
        stats: columnStats[col]
      })),
      sampleRows: data.slice(0, 10).map((row: any) =>
        columns.map((col: string) => row[col]).join(', ')
      ).join('\n'),
      uniqueValues: columns.reduce((acc: any, col: string) => {
        const values = data.map((row: any) => row[col]);
        acc[col] = [...new Set(values)].slice(0, 10); // First 10 unique values
        return acc;
      }, {})
    };

    // Detect language from user objective
    const detectLanguage = (text: string): string => {
      // Simple language detection based on common words
      const frenchWords = ['le', 'la', 'les', 'et', 'à', 'un', 'une', 'dans', 'par', 'pour', 'avec', 'sur', 'de', 'du', 'des', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles'];
      const arabicPattern = /[\u0600-\u06FF]/;
      const chinesePattern = /[\u4E00-\u9FFF]/;

      if (arabicPattern.test(text)) return 'ar';
      if (chinesePattern.test(text)) return 'zh';
      if (frenchWords.some(word => text.toLowerCase().includes(word))) return 'fr';
      return 'en'; // Default to English
    };

    const userLanguage = detectLanguage(objective);

    // Create enhanced prompt for Gemini with full context
    const prompt = `You are an AI data visualization expert. Analyze the complete dataset and user objective to recommend the best visualization approach.

IMPORTANT: The user asked their question in ${userLanguage === 'fr' ? 'French' : userLanguage === 'ar' ? 'Arabic' : userLanguage === 'zh' ? 'Chinese' : 'English'}.
You MUST respond with the summary in the SAME LANGUAGE as the user's question.

Dataset Overview:
- Total rows: ${dataContext.totalRows}
- Columns with types and stats: ${JSON.stringify(dataContext.columns, null, 2)}
- Sample data (first 10 rows):
${dataContext.sampleRows}

Unique values per column (first 10): ${JSON.stringify(dataContext.uniqueValues, null, 2)}

User Objective: "${objective}"

Based on this complete dataset analysis, return a JSON object with:
1. chartType: Best chart type among ["bar","line","pie","scatter","area"]
2. x: X-axis column name (must exist in columns)
3. y: Y-axis column name (must exist in columns, should be numeric for most charts)
4. groupBy: Grouping column name (null if not needed for multi-series)
5. dataTransform: How to transform the data ("none", "sum", "average", "count")
6. summary: A detailed 2-4 sentence analysis in the SAME LANGUAGE as the user's question, including:
   - Key insights and trends from the data
   - Interpretation of what the chart shows
   - Notable patterns, correlations, or anomalies
   - Practical implications or recommendations

Consider:
- Data types and relationships between columns
- User's objective and what they want to analyze
- Best practices for the chosen chart type
- Whether grouping makes sense for the objective
- Cultural context and language preferences

Return only valid JSON, no markdown or explanation.`;

    // Call Gemini API
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse the JSON response
    let chartConfig;
    try {
      // Clean the response text (remove any markdown formatting)
      const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
      chartConfig = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', text);
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    // Validate the response structure
    const requiredFields = ['chartType', 'x', 'y', 'summary'];
    const validChartTypes = ['bar', 'line', 'pie', 'scatter', 'area'];
    const validTransforms = ['none', 'sum', 'average', 'count'];

    for (const field of requiredFields) {
      if (!(field in chartConfig)) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 500 });
      }
    }

    if (!validChartTypes.includes(chartConfig.chartType)) {
      return NextResponse.json({ error: `Invalid chart type: ${chartConfig.chartType}` }, { status: 500 });
    }

    // Ensure columns exist in the dataset
    if (!columns.includes(chartConfig.x) || !columns.includes(chartConfig.y)) {
      return NextResponse.json({ error: 'Selected columns not found in dataset' }, { status: 500 });
    }

    if (chartConfig.groupBy && !columns.includes(chartConfig.groupBy)) {
      chartConfig.groupBy = null; // Reset invalid groupBy
    }

    // Validate dataTransform
    if (!chartConfig.dataTransform || !validTransforms.includes(chartConfig.dataTransform)) {
      chartConfig.dataTransform = 'none';
    }

    return NextResponse.json({
      chartType: chartConfig.chartType,
      x: chartConfig.x,
      y: chartConfig.y,
      groupBy: chartConfig.groupBy || null,
      dataTransform: chartConfig.dataTransform,
      summary: chartConfig.summary,
      data: data // Return the full dataset for chart rendering
    });

  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}