'use strict';
const { send, handler } = require('../_lib/http');
const { rpcService } = require('../_lib/supabase');
const { requireStudent } = require('../_lib/siswa');

module.exports = handler(['GET'], async (req, res) => {
  const s = await requireStudent(req);
  const data = await rpcService('portal_data', { p_student_id: s.studentId });
  send(res, 200, { ...data, must_change: s.mustChange });
});
