import json
from datetime import date, datetime
from flask import Flask, render_template, request, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config['SECRET_KEY'] = 'irrigacao-secret-key-2024'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///irrigacao.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)


class Cultura(db.Model):
    __tablename__ = 'culturas'
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    tipo = db.Column(db.String(100), nullable=False)
    area = db.Column(db.Float, nullable=False)
    fase = db.Column(db.String(50), nullable=False)
    kc = db.Column(db.Float, nullable=False)
    data_plantio = db.Column(db.Date, nullable=False)
    irrigacoes = db.relationship('Irrigacao', backref='cultura', lazy=True, cascade='all, delete-orphan')
    calculos = db.relationship('Calculo', backref='cultura', lazy=True, cascade='all, delete-orphan')


class Irrigacao(db.Model):
    __tablename__ = 'irrigacoes'
    id = db.Column(db.Integer, primary_key=True)
    cultura_id = db.Column(db.Integer, db.ForeignKey('culturas.id'), nullable=False)
    data = db.Column(db.Date, nullable=False)
    lamina_aplicada = db.Column(db.Float, nullable=False)
    volume_aplicado = db.Column(db.Float)
    observacoes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Calculo(db.Model):
    __tablename__ = 'calculos'
    id = db.Column(db.Integer, primary_key=True)
    cultura_id = db.Column(db.Integer, db.ForeignKey('culturas.id'), nullable=False)
    data = db.Column(db.Date, nullable=False)
    eto = db.Column(db.Float, nullable=False)
    precipitacao = db.Column(db.Float, nullable=False, default=0)
    lamina_necessaria = db.Column(db.Float, nullable=False)
    volume_necessario = db.Column(db.Float)
    alerta = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


FASES = [
    ('inicial', 'Inicial'),
    ('desenvolvimento', 'Desenvolvimento'),
    ('media', 'Média Temporada'),
    ('final', 'Final de Temporada'),
]

TIPOS_CULTURA = ['Milho', 'Soja', 'Feijão', 'Arroz', 'Cana-de-açúcar', 'Tomate', 'Outro']

KC_PADRAO = {
    'Milho':          {'inicial': 0.3,  'desenvolvimento': 0.7,  'media': 1.2,  'final': 0.6},
    'Soja':           {'inicial': 0.4,  'desenvolvimento': 0.8,  'media': 1.15, 'final': 0.5},
    'Feijão':         {'inicial': 0.4,  'desenvolvimento': 0.7,  'media': 1.1,  'final': 0.3},
    'Arroz':          {'inicial': 1.1,  'desenvolvimento': 1.2,  'media': 1.2,  'final': 0.9},
    'Cana-de-açúcar': {'inicial': 0.4,  'desenvolvimento': 0.9,  'media': 1.25, 'final': 0.75},
    'Tomate':         {'inicial': 0.4,  'desenvolvimento': 0.8,  'media': 1.15, 'final': 0.8},
    'Outro':          {'inicial': 0.5,  'desenvolvimento': 0.8,  'media': 1.1,  'final': 0.8},
}

FASES_LABEL = dict(FASES)


def calcular_lamina(eto, kc, precipitacao):
    return max(0.0, eto * kc - precipitacao)


def determinar_alerta(lamina):
    if lamina <= 0:
        return 'ok'
    elif lamina <= 3:
        return 'baixo'
    elif lamina <= 6:
        return 'medio'
    return 'alto'


@app.route('/')
def index():
    culturas = Cultura.query.all()
    calculos_recentes = Calculo.query.order_by(Calculo.created_at.desc()).limit(5).all()
    alertas = (Calculo.query
               .filter(Calculo.alerta.in_(['medio', 'alto']))
               .order_by(Calculo.created_at.desc())
               .limit(5).all())
    return render_template('index.html',
                           culturas=culturas,
                           calculos_recentes=calculos_recentes,
                           alertas=alertas)


@app.route('/culturas')
def culturas_index():
    culturas = Cultura.query.order_by(Cultura.data_plantio.desc()).all()
    return render_template('culturas/index.html', culturas=culturas, fases_label=FASES_LABEL)


@app.route('/culturas/nova', methods=['GET', 'POST'])
def culturas_nova():
    if request.method == 'POST':
        nome = request.form.get('nome', '').strip()
        tipo = request.form.get('tipo', '').strip()
        area = request.form.get('area', '')
        fase = request.form.get('fase', '')
        kc = request.form.get('kc', '')
        data_plantio = request.form.get('data_plantio', '')

        if not all([nome, tipo, area, fase, kc, data_plantio]):
            flash('Todos os campos são obrigatórios.', 'danger')
        else:
            cultura = Cultura(
                nome=nome,
                tipo=tipo,
                area=float(area),
                fase=fase,
                kc=float(kc),
                data_plantio=date.fromisoformat(data_plantio),
            )
            db.session.add(cultura)
            db.session.commit()
            flash(f'Cultura "{nome}" cadastrada com sucesso!', 'success')
            return redirect(url_for('culturas_index'))

    return render_template('culturas/nova.html',
                           fases=FASES,
                           tipos=TIPOS_CULTURA,
                           kc_padrao=KC_PADRAO)


@app.route('/culturas/<int:id>')
def culturas_detalhe(id):
    cultura = db.get_or_404(Cultura, id)
    irrigacoes = Irrigacao.query.filter_by(cultura_id=id).order_by(Irrigacao.data.desc()).all()
    calculos = Calculo.query.filter_by(cultura_id=id).order_by(Calculo.data.desc()).all()
    return render_template('culturas/detalhe.html',
                           cultura=cultura,
                           irrigacoes=irrigacoes,
                           calculos=calculos,
                           fases_label=FASES_LABEL)


@app.route('/culturas/<int:id>/excluir', methods=['POST'])
def culturas_excluir(id):
    cultura = db.get_or_404(Cultura, id)
    nome = cultura.nome
    db.session.delete(cultura)
    db.session.commit()
    flash(f'Cultura "{nome}" excluída com sucesso!', 'success')
    return redirect(url_for('culturas_index'))


@app.route('/irrigacoes')
def irrigacoes_index():
    irrigacoes = Irrigacao.query.order_by(Irrigacao.data.desc()).all()
    return render_template('irrigacoes/index.html', irrigacoes=irrigacoes)


@app.route('/irrigacoes/nova', methods=['GET', 'POST'])
def irrigacoes_nova():
    culturas = Cultura.query.order_by(Cultura.nome).all()
    culturas_json = json.dumps([{'id': c.id, 'nome': c.nome, 'area': c.area} for c in culturas])
    today = date.today().isoformat()

    if request.method == 'POST':
        cultura_id = request.form.get('cultura_id', '')
        data_str = request.form.get('data', '')
        lamina = request.form.get('lamina_aplicada', '')
        observacoes = request.form.get('observacoes', '').strip()

        if not all([cultura_id, data_str, lamina]):
            flash('Preencha todos os campos obrigatórios.', 'danger')
        else:
            cultura = db.get_or_404(Cultura, int(cultura_id))
            lamina_f = float(lamina)
            volume = lamina_f * cultura.area * 10
            irrigacao = Irrigacao(
                cultura_id=int(cultura_id),
                data=date.fromisoformat(data_str),
                lamina_aplicada=lamina_f,
                volume_aplicado=volume,
                observacoes=observacoes or None,
            )
            db.session.add(irrigacao)
            db.session.commit()
            flash('Irrigação registrada com sucesso!', 'success')
            return redirect(url_for('irrigacoes_index'))

    return render_template('irrigacoes/nova.html',
                           culturas=culturas,
                           culturas_json=culturas_json,
                           today=today)


@app.route('/calculos/lamina', methods=['GET', 'POST'])
def calculos_lamina():
    culturas = Cultura.query.order_by(Cultura.nome).all()
    today = date.today().isoformat()
    resultado = None

    if request.method == 'POST':
        cultura_id = request.form.get('cultura_id', '')
        eto = request.form.get('eto', '')
        precipitacao = request.form.get('precipitacao', '0') or '0'
        data_str = request.form.get('data', today)
        salvar = request.form.get('salvar') == 'true'

        if not cultura_id or not eto:
            flash('Selecione uma cultura e informe o ETo.', 'danger')
        else:
            cultura = db.get_or_404(Cultura, int(cultura_id))
            eto_f = float(eto)
            prec_f = float(precipitacao)
            lamina = calcular_lamina(eto_f, cultura.kc, prec_f)
            volume = lamina * cultura.area * 10
            alerta = determinar_alerta(lamina)

            resultado = {
                'cultura': cultura,
                'eto': eto_f,
                'precipitacao': prec_f,
                'etr': round(eto_f * cultura.kc, 2),
                'lamina': lamina,
                'volume': volume,
                'alerta': alerta,
                'data': data_str,
            }

            if salvar:
                calculo = Calculo(
                    cultura_id=int(cultura_id),
                    data=date.fromisoformat(data_str),
                    eto=eto_f,
                    precipitacao=prec_f,
                    lamina_necessaria=lamina,
                    volume_necessario=volume,
                    alerta=alerta,
                )
                db.session.add(calculo)
                db.session.commit()
                flash('Cálculo salvo com sucesso!', 'success')

    return render_template('calculos/lamina.html',
                           culturas=culturas,
                           resultado=resultado,
                           today=today)


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
