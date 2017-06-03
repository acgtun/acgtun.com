import sqlite3 as sql


class Database:
    def __init__(self, db_path):
        self.db_path = db_path
        self.connection = sql.connect(db_path)

    def execute(self, command, parameters=None):
        if parameters is None:
            self.connection.execute(command)
        else:
            self.connection.execute(command, parameters)

    def query(self, query, parameters=None):
        if parameters is None:
            parameters = ()
        cursor = self.connection.cursor()
        cursor.execute(query, parameters)
        response = cursor.fetchall()
        return response

    def commit(self):
        self.connection.commit()


def sql_create_table(table_name, columns):
    return "CREATE TABLE IF NOT EXISTS {} \n({})".format(table_name, ",\n".join([str(c) for c in columns]))


def sql_insert_row(table_name, column_names):
    placeholders = ', '.join('?' * len(column_names))
    return "INSERT INTO {} ({}) \n VALUES ({})".format(table_name, ",".join(column_names), placeholders)


def update_table(db, table_name, column_names):
    columns = {}
    columns['id'] = {'type': 'INTEGER', 'suffix': 'PRIMARY KEY AUTOINCREMENT'}
    for c in column_names:
        columns[c] = {'type': 'TEXT', 'suffix': None}

    db.execute(sql_create_table(table_name, columns))
    db.commit()
