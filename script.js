import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { getDatabase, ref, onValue, push, remove,update } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-database.js";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// ✅ Gemini setup
const genAI = new GoogleGenerativeAI("AIzaSyBqhtHVglycODOqAw4Vjfec6Gf2aVxdF1s");

/* ========== Firebase config ========== */
const firebaseConfig = {
  apiKey: "AIzaSyALIq-7sKX_yi4qbikHldoIDbymSem2gxg",
  authDomain: "sampledb-9009e.firebaseapp.com",
  databaseURL: "https://sampledb-9009e-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "sampledb-9009e",
  storageBucket: "sampledb-9009e.appspot.com",  
  messagingSenderId: "894153581819",
  appId: "1:894153581819:web:d1d73e4345957781cb3c5e",
  measurementId: "G-7EDBYZMJVR"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

onAuthStateChanged(auth, user => {
  if (!user) {
    console.log("No user signed in (auth check).");
  } else {
    console.log("User signed in:", user.email);
  }
});

/* ========== Globals ========== */
const ratingScores = { "Excellent": 5, "Very Good": 4, "Good": 3, "Average": 2, "Poor": 1 };
const ratingOrder = ["Excellent", "Very Good", "Good", "Average", "Poor"];

let questions = [];
let lastResult = null;   // processed results + summary
let lastRows = null;     // raw excel rows

/* ========== DOM refs ========== */
const parseBtn = document.getElementById('parseBtn');
const pdfBtn = document.getElementById('pdfBtn');
const refreshQuestionsBtn = document.getElementById('refreshQuestionsBtn');
const addQuestionBtn = document.getElementById('addQuestionBtn');
const newQuestionInput = document.getElementById('newQuestion');
const questionListContainer = document.getElementById('questionList');
const fileInput = document.getElementById('file');
const trainerNamesInput = document.getElementById('trainerNames');
const outputDiv = document.getElementById('output');
const summaryOutput = document.getElementById('summaryOutput');


// ---------------- Question management (inline edit) ----------------
function startQuestionsListener() {
  const qRef = ref(db, 'questions');
  onValue(qRef, snapshot => {
    questions = [];
    const val = snapshot.val();
    if (!val) {
      const defaults = [
        "The trainer provided me adequate opportunity to ask questions / clarify concepts",
        "Included an appropriate number of activities, exercises and interactions",
        "The trainer is a subject matter expert and approachable",
        "The trainer encouraged participation and enthusiasm throughout the class"
      ];
      // seed defaults (async but ok)
      defaults.forEach(d => push(qRef, { text: d }));
      return;
    }
    Object.entries(val).forEach(([key, node]) => {
      let text = (typeof node === 'string') ? node : (node && (node.text ?? node));
      questions.push({ key, text });
    });
    renderQuestionList();
    console.log('Questions loaded:', questions);
  });
}

function renderQuestionList() {
  questionListContainer.innerHTML = '';
  if (!questions.length) {
    questionListContainer.innerHTML = '<div style="color:#666">No questions yet.</div>';
    return;
  }

  questions.forEach(q => {
    const item = document.createElement('div');
    item.className = 'question-item';
    item.style.alignItems = 'center'; // ensure alignment

    const span = document.createElement('div');
    span.className = 'question-text';
    span.textContent = q.text;
    span.style.flex = '1';
    span.style.paddingRight = '12px';

    // Edit button (pencil later, for now text)
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn';
    editBtn.textContent = 'Edit';
    editBtn.style.marginRight = "8px";
    editBtn.addEventListener('click', () => startInlineEdit(item, q));

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteQuestion(q.key));

    item.appendChild(span);
    item.appendChild(editBtn);
    item.appendChild(delBtn);
    questionListContainer.appendChild(item);
  });
}

async function addQuestion() {
  const text = (newQuestionInput.value || '').trim();
  if (!text) return alert('Please type a question to add.');
  await push(ref(db, 'questions'), { text });
  newQuestionInput.value = '';
}

// keep delete as-is
async function deleteQuestion(key) {
  if (!confirm('Delete this question?')) return;
  await remove(ref(db, `questions/${key}`));
}

// Inline edit UI
function startInlineEdit(item, q) {
  // preserve class / layout
  item.innerHTML = '';
  item.className = 'question-item';
  item.style.alignItems = 'center';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = q.text;
  input.style.flex = '1';
  input.style.padding = '8px 10px';
  input.style.border = '1px solid #d1d5db';
  input.style.borderRadius = '6px';
  input.style.marginRight = '8px';
  input.style.fontSize = '14px';
  input.setAttribute('aria-label', 'Edit question');

  const saveBtn = document.createElement('button');
  saveBtn.className = 'action-btn';
  saveBtn.textContent = 'Save';
  saveBtn.style.marginRight = '8px';
  saveBtn.disabled = true; // disabled until change

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'action-btn';
  cancelBtn.textContent = 'Cancel';

  // enable save only when text changed and non-empty
  input.addEventListener('input', () => {
    const changed = input.value.trim() !== (q.text || '').trim();
    saveBtn.disabled = !changed || input.value.trim().length === 0;
  });

  // keyboard shortcuts
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !saveBtn.disabled) {
      ev.preventDefault();
      saveBtn.click();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      cancelBtn.click();
    }
  });

  saveBtn.addEventListener('click', async () => {
    const newText = input.value.trim();
    if (!newText) {
      alert('Question cannot be empty.');
      input.focus();
      return;
    }
    try {
      // update in Firebase
      await update(ref(db, `questions/${q.key}`), { text: newText });
      // optimistic UI: re-render (onValue will also refresh)
      renderQuestionList();
    } catch (err) {
      console.error('Failed to update question:', err);
      alert('Failed to save question — check console for details.');
    }
  });

  cancelBtn.addEventListener('click', () => {
    renderQuestionList();
  });

  // append elements
  item.appendChild(input);
  item.appendChild(saveBtn);
  item.appendChild(cancelBtn);

  // focus input (move cursor to end)
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}



function handleParse() {
  const f = fileInput.files?.[0];
  if (!f) return alert("Please upload an Excel (.xlsx) file first.");

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const data = new Uint8Array(ev.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (!rows.length) return alert("Excel sheet is empty.");

    lastRows = rows;

    let batchName = f.name.replace(/\.[^.]+$/, ""); // remove extension
batchName = batchName.replace(/[_]/g, " ").trim();

// ✅ Try to extract "Batch X" (e.g., "Batch 5")
const match = batchName.match(/Batch\s*\d+/i);
if (match) {
  batchName = match[0].replace(/\s+/g, ""); // "Batch5"
} else {
  batchName = batchName.split(" ")[0]; // fallback: first word
}

console.log("📌 Final Batch Name:", batchName);

lastResult = lastResult || {};
lastResult.batchName = batchName;
    // detect type automatically
if (isMultiTrainer(rows)) {
  console.log("📌 Detected Multi-trainer format");
  document.getElementById("singleTrainerBox").style.display = "none";
  parseMultiAuto(rows);
  pdfBtn.disabled = false;
  await summarizeFeedbackFromExcel();
} else {
  console.log("📌 Detected Single-trainer format");
  document.getElementById("singleTrainerBox").style.display = "block";

  // Attach confirm handler
  const confirmBtn = document.getElementById("confirmTrainerBtn");
  confirmBtn.onclick = async () => {
    const trainerName = document.getElementById("singleTrainerName").value.trim();
    if (!trainerName) {
      alert("Please enter trainer name before confirming.");
      return;
    }

    parseNewFormat(rows, trainerName);
    pdfBtn.disabled = false;
    await summarizeFeedbackFromExcel();
  };
}
  };
  reader.readAsArrayBuffer(f);
}




function isMultiTrainer(rows) {
  const headers = Object.keys(rows[0] || {}).map(h => h.toLowerCase().trim());

  // Single trainer files always have "overall program rating"
  if (headers.includes("overall program rating")) {
    return false; // ✅ single trainer
  }

  // Multi-trainer: headers like "Suneesh1", "Lekshmi2"
  return headers.some(h => /^[A-Za-z ]+\d+$/.test(h));
}




// ✅ Extract trainer names automatically
function extractTrainerNames(rows) {
  const headers = Object.keys(rows[0] || {});
  const names = new Set();

  headers.forEach(h => {
    const match = h.match(/^(.+?)\d+$/); // Trainer + number
    if (match) names.add(match[1].trim());
  });

  return Array.from(names);
}

/* ========== Summarizer ========== */
async function summarizeFeedbackFromExcel() {
  if (!lastRows) return;

  const headers = Object.keys(lastRows[0] || {});
  const findKey = (needle) =>
    headers.find(h => h.trim().toLowerCase().startsWith(needle));

  const wentWellKey = findKey("what went well");
  const needsKey    = findKey("what need");

  if (!wentWellKey || !needsKey) {
    summaryOutput.innerHTML = "<em>Could not find feedback columns in Excel.</em>";
    return;
  }

  const wentWell = lastRows.map(r => r[wentWellKey]).filter(Boolean).join("\n");
  const needs    = lastRows.map(r => r[needsKey]).filter(Boolean).join("\n");

  summaryOutput.innerHTML = "<em>Summarizing feedback, please wait...</em>";

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const wentWellResp = await model.generateContent(
      `Summarize the following feedback into 3-4 concise bullet points:\n\n${wentWell}`
    );
    const needsResp = await model.generateContent(
      `Summarize the following improvement feedback into 3-4 concise bullet points:\n\n${needs}`
    );

    const wwTextRaw = wentWellResp.response.text();
const niTextRaw = needsResp.response.text();

// clean + turn into arrays
const wwLines = cleanFeedbackText(wwTextRaw);
const niLines = cleanFeedbackText(niTextRaw);

// show in preview as bulleted list
summaryOutput.innerHTML = `
  <h3>Feedback Summary</h3>
  <div style="margin-top:8px;">
    <h4>What Went Well</h4>
    <div style="background:#e0f2fe; padding:12px 16px; border-radius:8px; color:#1e3a8a;">
      ${wwLines.map(l => `• ${escapeHtml(l)}`).join("<br>")}
    </div>
  </div>

  <div style="margin-top:12px;">
    <h4>What Needs Improvement</h4>
    <div style="background:#fee2e2; padding:12px 16px; border-radius:8px; color:#991b1b;">
      ${niLines.map(l => `• ${escapeHtml(l)}`).join("<br>")}
    </div>
  </div>
`;

// save clean text in lastResult for PDF
lastResult.summary = { wentWell: wwLines.join("\n"), needs: niLines.join("\n") };

  } catch (err) {
    console.error(err);
    summaryOutput.innerHTML = "<span style='color:red'>Error while summarizing feedback.</span>";
  }
}


function parseNewFormat(rows, trainerName) {
  const headers = Object.keys(rows[0]);

  const questionCols =  headers.filter(h => rows.some(r => ratingScores[r[h]] !== undefined)).slice(0, -1);

  const results = [];
  questionCols.forEach(qCol => {
    const counts = { "Excellent": 0, "Very Good": 0, "Good": 0, "Average": 0, "Poor": 0 };
    let total = 0, responses = 0;

    rows.forEach(r => {
      const v = r[qCol];
      if (v && ratingScores[v] !== undefined) {
        counts[v]++;
        total += ratingScores[v];
        responses++;
      }
    });

    const avg = responses ? (total / responses).toFixed(2) : "—";
    results.push({ question: qCol, counts, avg, responses });
  });

  // Overall rating
  let overallSum = 0, overallCount = 0;
  rows.forEach(r => {
    const v = parseFloat(r["Overall program rating"]);
    if (!isNaN(v)) {
      overallSum += v;
      overallCount++;
    }
  });
  const overallAvg = overallCount ? (overallSum / overallCount).toFixed(2) : "—";

  // Render preview
  let html = `<h3>Trainer: ${trainerName}</h3>`;
  html += `<h4>Overall Program Rating (Avg): ${overallAvg}</h4>`;
  results.forEach(r => {
    html += `<div class="question-block"><h4>${escapeHtml(r.question)}</h4>
      <table><tr>${ratingOrder.map(rt => `<th>${rt}</th>`).join("")}<th>Avg</th><th>Responses</th></tr>
      <tr>${ratingOrder.map(rt => `<td>${r.counts[rt]}</td>`).join("")}<td>${r.avg}</td><td>${r.responses}</td></tr>
      </table></div>`;
  });
  outputDiv.innerHTML = html;

  lastResult = {
  ...lastResult,
  trainerName,
  overallRating: overallAvg,
  questionsData: results
};


  // Report button
  const btn = document.createElement("button");
btn.textContent = `Download Report for ${trainerName}`;
btn.className = "action-btn";
btn.style.marginTop = "20px";
btn.addEventListener("click", () => {
  localStorage.setItem("trainerReportData", JSON.stringify({
    trainerName,
    batchName: lastResult.batchName || "Batch X",
    traineeCount: rows.length,
    overallRating: overallAvg,
    questionsData: results,
    summary: lastResult.summary || { wentWell: "", needs: "" }
  }));
  window.open("report.html", "_blank");
});

// put button after the preview
outputDiv.appendChild(btn);
}

function parseMultiAuto(rows) {
  const trainerNames = extractTrainerNames(rows);
  if (!trainerNames.length) {
    return alert("No trainer columns detected.");
  }

  const results = {};
  trainerNames.forEach(trainer => {
    results[trainer] = [];
    questions.forEach((qObj, qi) => {
      const qText = qObj.text;
      const colName = (qi === 0 ? trainer : trainer + (qi + 1));

      const counts = { "Excellent": 0, "Very Good": 0, "Good": 0, "Average": 0, "Poor": 0 };
      let total = 0, responses = 0;

      rows.forEach(r => {
        const v = r[colName];
        if (v && ratingScores[v] !== undefined) {
          counts[v]++;
          total += ratingScores[v];
          responses++;
        }
      });

      const avg = responses ? (total / responses).toFixed(2) : "—";
      results[trainer].push({ question: qText, counts, avg, responses });
    });
  });

  // render preview
  let html = "";
  for (const [trainer, qResults] of Object.entries(results)) {
    html += `<div class="trainer-block"><h3>Trainer: ${escapeHtml(trainer)}</h3>
      <table>
        <tr>
          <th>Question</th>
          ${ratingOrder.map(r => `<th>${r}</th>`).join("")}
          <th>Avg</th><th>Responses</th>
        </tr>`;
    qResults.forEach(r => {
      html += `<tr>
        <td>${escapeHtml(r.question)}</td>
        ${ratingOrder.map(rt => `<td>${r.counts[rt]}</td>`).join("")}
        <td>${r.avg}</td><td>${r.responses}</td>
      </tr>`;
    });
    html += `</table></div>`;
  }
  outputDiv.innerHTML = html;
  lastResult = {
  ...lastResult,
  ...results
};

  // 🚀 per-trainer download buttons
  Object.keys(results).forEach(trainer => {
  const btn = document.createElement("button");
  btn.textContent = `Download Report for ${trainer}`;
  btn.className = "action-btn";
  btn.style.marginTop = "20px";
  btn.style.marginRight = "10px"; 
  btn.addEventListener("click", () => {
    localStorage.setItem("trainerReportData", JSON.stringify({
      trainerName: trainer,
      batchName: lastResult.batchName || "Batch X",
      traineeCount: results[trainer][0].responses,
      overallRating: (
        results[trainer].reduce((sum, q) => sum + (parseFloat(q.avg) || 0), 0) /
        results[trainer].length
      ).toFixed(2),
      questionsData: results[trainer],
      summary: lastResult.summary || { wentWell: "", needs: "" }
    }));
    window.open("report.html", "_blank");
  });

  // place button after that trainer's preview block
  outputDiv.appendChild(btn);
});

}

function cleanFeedbackText(raw) {
  if (!raw) return [];
  return raw
    .split("\n")
    .map(line => line.trim())
    .filter(line => line)              // remove empty lines
    .map(line => {
      // strip emojis/symbols
      line = line.replace(/^(\*|\-|\•|\✅|\⚠️)\s*/g, "");
      // strip markdown bold (**text** → text)
      line = line.replace(/\*\*(.*?)\*\*/g, "$1");
      return line;
    });
}


function fillReport(trainerName, batchName, traineeCount, overallRating, questionsData, summary) {
  // Header + Info table
  document.getElementById("trainerName").textContent = trainerName;
  document.getElementById("batchName").textContent = batchName;
  document.getElementById("traineeCount").textContent = traineeCount;
  document.getElementById("trainerNameTable").textContent = trainerName;
  document.getElementById("overallRating").textContent = overallRating;

  // Build feedback matrix
  const matrix = document.getElementById("feedbackMatrix");
  matrix.innerHTML = "";

  // Header row with questions
  const headerRow = document.createElement("tr");
  questionsData.forEach(qObj => {
    const th = document.createElement("th");
    th.textContent = qObj.question;
    headerRow.appendChild(th);
  });
  matrix.appendChild(headerRow);

  // Score rows (Excellent, Very Good, etc.)
  const scores = ["Excellent", "Very Good", "Good", "Average", "Poor"];
  scores.forEach(score => {
    const row = document.createElement("tr");
    questionsData.forEach(qObj => {
      const cell = document.createElement("td");
      cell.innerHTML = `
        <table class="cell-table">
          <tr>
            <td class="cell-label">${score}</td>
            <td class="cell-count">${qObj.counts[score] || 0}</td>
          </tr>
        </table>
      `;
      row.appendChild(cell);
    });
    matrix.appendChild(row);
  });

  // Total responses row
  const totalRow = document.createElement("tr");
  questionsData.forEach(qObj => {
    const cell = document.createElement("td");
    cell.innerHTML = `
      <table class="cell-table">
        <tr>
          <td class="cell-label">Total responded</td>
          <td class="cell-count">${qObj.responses}</td>
        </tr>
      </table>
    `;
    totalRow.appendChild(cell);
  });
  matrix.appendChild(totalRow);

  // --- Helper functions for cleaning + bullet rendering ---
  function cleanText(text) {
    return text
      .replace(/[*_#`>]/g, "")   // remove markdown symbols
      .replace(/[✅⚠️]/g, "")    // remove emojis
      .trim();
  }

  function renderBulletedList(containerId, text) {
    const container = document.getElementById(containerId);
    container.innerHTML = (text || "")
      .split("\n")
      .filter(line => line.trim())
      .map(c => `<p>• ${cleanText(c)}</p>`)
      .join("");
  }

  // AI Feedback sections
  renderBulletedList("wentWell", summary.wentWell);
  renderBulletedList("needsImprovement", summary.needs);
}

// --- Download Report as PDF with auto-wrap ---
function downloadReportAsPDF(trainerName) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "pt", "a4");

  const element = document.body; // whole page
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;

  html2canvas(element, { scale: 2 }).then(canvas => {
    const imgData = canvas.toDataURL("image/png");
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let position = margin;
    doc.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);

    // Wrap and add "What Went Well" section
    if (document.getElementById("wentWell").innerText.trim()) {
      doc.addPage();
      doc.setFontSize(13);
      doc.text("What Went Well", margin, 50);
      doc.setFontSize(11);

      const wwLines = doc.splitTextToSize(
        document.getElementById("wentWell").innerText,
        pageWidth
      );
      doc.text(wwLines, margin, 70);
    }

    // Wrap and add "Needs Improvement" section
    if (document.getElementById("needsImprovement").innerText.trim()) {
      doc.addPage();
      doc.setFontSize(13);
      doc.text("What Needs Improvement", margin, 50);
      doc.setFontSize(11);

      const niLines = doc.splitTextToSize(
        document.getElementById("needsImprovement").innerText,
        pageWidth
      );
      doc.text(niLines, margin, 70);
    }

    doc.save(`Trainer_Feedback_Report_${trainerName}.pdf`);
  });
}

/* ========== Helpers ========== */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]);
}

/* ========== Events ========== */
parseBtn.addEventListener('click', handleParse);
addQuestionBtn.addEventListener('click', addQuestion);
refreshQuestionsBtn.addEventListener('click', () => renderQuestionList());

/* ========== Start ========== */
startQuestionsListener();

