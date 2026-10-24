import { jsPDF } from 'jspdf';

window.ClassSchedulePdf = {
  generate({ meta, rows, fileName = 'emploi-du-temps.pdf' }) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 18;
    const center = text => doc.text(String(text || ''), pageWidth / 2, y, { align: 'center' });

    doc.setFillColor(20, 43, 69);
    doc.rect(0, 0, pageWidth, 42, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    center(meta.school || 'Établissement scolaire'); y += 8;
    doc.setFontSize(15);
    center('EMPLOI DU TEMPS DES COURS'); y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    center(`${meta.year || 'Année scolaire'}  ·  ${meta.subject || 'Discipline'}  ·  ${meta.level || 'Niveau'}`); y += 5;
    center(`Chargé(e) de cours : ${meta.teacher || 'À renseigner'}`);

    y = 54;
    doc.setTextColor(23, 35, 52);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const columns = [15, 42, 61, 82, 111, 150];
    const labels = ['Jour', 'Début', 'Fin', 'Classe', 'Discipline', 'Cours / thème'];
    doc.setFillColor(229, 107, 79);
    doc.rect(12, y - 6, 186, 9, 'F');
    doc.setTextColor(255, 255, 255);
    labels.forEach((label, i) => doc.text(label, columns[i], y, { maxWidth: i === 5 ? 45 : 25 }));
    y += 9;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(23, 35, 52);
    rows.forEach((row, index) => {
      if (y > 276) { doc.addPage(); y = 20; }
      if (index % 2 === 0) { doc.setFillColor(244, 247, 251); doc.rect(12, y - 5, 186, 8, 'F'); }
      const values = [row.day, row.start, row.end, row.className, row.subject, row.topic];
      values.forEach((value, i) => doc.text(String(value || '—'), columns[i], y, { maxWidth: i === 5 ? 45 : 25 }));
      y += 8;
    });
    if (!rows.length) { doc.text('Aucune séance programmée.', 15, y + 8); y += 16; }
    doc.setDrawColor(216, 226, 237);
    doc.line(12, 282, 198, 282);
    doc.setFontSize(8);
    doc.setTextColor(101, 117, 138);
    doc.text(`Document généré par Classe · ${new Date().toLocaleDateString('fr-FR')}`, 15, 288);
    doc.save(fileName);
  },
};
