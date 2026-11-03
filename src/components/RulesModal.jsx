import React from 'react';
import { X, BookOpen, Award, CheckCircle2, AlertCircle } from 'lucide-react';

export default function RulesModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center space-x-2 text-amber-400">
            <BookOpen className="w-6 h-6" />
            <h2 className="text-xl font-bold tracking-tight">Pravidla českých Žolíků</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm leading-relaxed">
          {/* Základní cíl */}
          <section className="space-y-2">
            <h3 className="text-base font-semibold text-amber-400 flex items-center gap-2">
              <Award className="w-5 h-5" /> Cíl hry
            </h3>
            <p>
              Žolíky se hrají se dvěma balíčky kanastových karet (celkem <strong>108 karet</strong> včetně 4 žolíků).
              Cílem každého hráče je zbavit se všech svých karet vykládáním platných kombinací na stůl a přikládáním
              k již existujícím kombinacím. Hráč, který se zbaví všech karet a poslední odhodí na odhazovací balíček, vyhrává kolo.
            </p>
          </section>

          {/* Průběh tahu */}
          <section className="space-y-2">
            <h3 className="text-base font-semibold text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> Průběh jednoho tahu
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 pl-2">
              <li>
                <strong>Dobrání karty:</strong> Hráč si vezme vrchní kartu z talónu (lícem dolů), nebo vrchní kartu z odhazovacího balíčku.
                <span className="text-xs text-amber-300 block ml-6 mt-0.5">
                  * Pravidlo odhozu: Kartu z odhozu smíte vzít pouze tehdy, když ji v témže tahu <strong>ihned použijete k vyložení nebo přiložení</strong>! Pokud ji použít nemůžete, musíte ji vrátit zpět tlačítkem a líznout z talónu.
                </span>
              </li>
              <li>
                <strong>Vyložení a přikládání (nepovinné):</strong> Hráč může vyložit nové kombinace, přiložit karty ke stolu, nebo vyměnit kartu za žolíka.
                <span className="text-xs text-amber-300 block ml-6 mt-0.5">
                  * Pozor: V ruce vám musí vždy zůstat alespoň 1 karta na závěrečné odhození pro ukončení tahu / zavření!
                </span>
              </li>
              <li>
                <strong>Odhození karty (povinné):</strong> Hráč odloží jednu kartu na odhazovací balíček, čímž svůj tah ukončí nebo hru zavře.
              </li>
            </ol>
          </section>

          {/* Platné kombinace */}
          <section className="space-y-2">
            <h3 className="text-base font-semibold text-amber-400">Platné kombinace</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-stone-800/60 rounded-xl border border-stone-700/60">
                <div className="font-bold text-white mb-1">1. Postupka (Sequence)</div>
                <p className="text-xs text-stone-300">
                  Minimálně 3 karty <strong>stejné barvy</strong> za sebou (např. 7♥ 8♥ 9♥ nebo Q♠ K♠ A♠).
                  Eso může být malé (A-2-3, hodnota 1 b) nebo velké (Q-K-A, hodnota 10 b).
                </p>
              </div>
              <div className="p-3 bg-stone-800/60 rounded-xl border border-stone-700/60">
                <div className="font-bold text-white mb-1">2. Skupina (Trojice / Čtveřice)</div>
                <p className="text-xs text-stone-300">
                  3 nebo 4 karty <strong>stejné hodnoty</strong> s <strong>různými barvami</strong> (např. 8♥ 8♦ 8♠).
                  Dvě karty stejné barvy v jedné skupině nejsou povoleny!
                </p>
              </div>
            </div>
          </section>

          {/* První vyložení (42 bodů) */}
          <section className="space-y-2 p-3 bg-amber-950/30 rounded-xl border border-amber-800/40">
            <h3 className="text-base font-semibold text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" /> Podmínka prvního vyložení
            </h3>
            <p className="text-xs text-stone-200">
              Aby mohl hráč poprvé položit karty na stůl, musí jeho vykládané kombinace v tomto tahu mít dohromady
              minimálně <strong>42 bodů</strong> a obsahovat alespoň jednu <strong>čistou postupku</strong> (postupku bez žolíka)!
            </p>
            <div className="text-xs text-stone-400 mt-1">
              Hodnoty pro vyložení: 2–10 = lícová hodnota, J, Q, K = 10 bodů, Eso = 10 bodů (v malé postupce 1 bod), Žolík = hodnota karty, kterou nahrazuje.
            </div>
          </section>

          {/* Výměna Žolíka & Zavření z ruky */}
          <section className="space-y-2">
            <h3 className="text-base font-semibold text-purple-400">Speciální tahy</h3>
            <ul className="space-y-2 text-xs">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">🃏</span>
                <span>
                  <strong>Výměna žolíka:</strong> V postupce lze žolíka vyměnit za kartu, kterou přesně nahrazuje. Ve <strong>skupině stejných hodnot</strong> lze žolíka vzít až při výměně <strong>4. karty</strong> (skupina musí obsahovat 4 karty se žolíkem, aby byla barva jednoznačně určena)!
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">⏱️</span>
                <span>
                  <strong>Vykládání až po 3. kole:</strong> V úvodních kolech se pouze dobírá a odhazuje; vykládat kombinace na stůl je povoleno až po odehrání úvodních kol (standardně po 3. kole).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">↩️</span>
                <span>
                  <strong>Karta z odhozu:</strong> Pokud si vezmete vrchní kartu z odhazovacího balíčku, musíte ji v tomto tahu ihned použít k vyložení na stůl! Pokud ji použít nemůžete, musíte ji tlačítkem vrátit a líznout si z talónu.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">🌟</span>
                <span>
                  <strong>Zavření z ruky:</strong> Pokud se hráč ještě nevyložil a v jednom jediném tahu vyloží všechny své karty a poslední odhodí, je to &quot;Zavření z ruky&quot; a všem soupeřům se trestné body násobí dvěma!
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✨</span>
                <span>
                  <strong>Zavření se žolíkem do dalšího kola:</strong> Pokud má již vyložený hráč v ruce poslední 2 karty (jednu běžnou a jednoho žolíka), může běžnou kartu odhodit a tím kolo vyhrát! Žolík mu zůstává a v příštím kole s ním začíná jako s bonusem navíc!
                </span>
              </li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-950/60 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-500 active:scale-95 font-semibold text-white rounded-xl shadow transition"
          >
            Rozumím, jdeme hrát!
          </button>
        </div>
      </div>
    </div>
  );
}

