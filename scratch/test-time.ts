import { getServiceBufferEndTime } from '../lib/service-resolver';

console.log('--- Testing Buffer Times ---');
console.log('First Service (09:15 official):', getServiceBufferEndTime('First Service', '09:15')); // Expected: 09:15 (0 grace)
console.log('Sunday School (09:50 official):', getServiceBufferEndTime('Sunday School', '09:50')); // Expected: 09:50 (0 grace)
console.log('Second Service (12:00 official):', getServiceBufferEndTime('Second Service', '12:00')); // Expected: 14:00 (+120m grace)
console.log('Thanksgiving Service (12:00 official):', getServiceBufferEndTime('Thanksgiving Service', '12:00')); // Expected: 14:00 (+120m grace)
console.log('Digging Deep (18:00 official):', getServiceBufferEndTime('Digging Deep', '18:00')); // Expected: 19:00 (+60m grace)
console.log('Faith Clinic (18:00 official):', getServiceBufferEndTime('Faith Clinic', '18:00')); // Expected: 19:00 (+60m grace)
console.log('Hour of Mercy (09:00 official):', getServiceBufferEndTime('Hour of Mercy', '09:00')); // Expected: 09:45 (+45m grace)
