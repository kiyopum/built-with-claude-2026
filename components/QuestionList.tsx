// 聞くことリスト（質問の種類ごとに色の札をつける）
export type Question = { group: "事業者" | "商品" | "表示・法律"; question: string; why: string };

const GROUP_STYLE: Record<Question["group"], string> = {
  事業者: "bg-black/5 text-black/60",
  商品: "bg-biz/10 text-biz",
  "表示・法律": "bg-red-50 text-red-700",
};

export function QuestionList({ questions }: { questions: Question[] }) {
  return (
    <ol className="space-y-3">
      {questions.map((q, i) => (
        <li key={i} className="flex gap-3">
          <span className="shrink-0 w-7 h-7 rounded-full bg-biz/10 text-biz text-sm font-bold grid place-items-center">{i + 1}</span>
          <div>
            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold mb-1 ${GROUP_STYLE[q.group] ?? ""}`}>{q.group}</span>
            <div className="font-medium">{q.question}</div>
            <div className="text-xs text-black/50">{q.why}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
