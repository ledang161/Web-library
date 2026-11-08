INSERT INTO equipment (name,category,quantity,description,status)
SELECT 'Máy tính mẫu','Máy tính',5,'Dữ liệu giả phục vụ phát triển.','available'
WHERE NOT EXISTS (SELECT 1 FROM equipment WHERE name='Máy tính mẫu');
INSERT INTO equipment (name,category,quantity,description,status)
SELECT 'Máy chiếu mẫu','Trình chiếu',2,'Dữ liệu giả phục vụ phát triển.','available'
WHERE NOT EXISTS (SELECT 1 FROM equipment WHERE name='Máy chiếu mẫu');
